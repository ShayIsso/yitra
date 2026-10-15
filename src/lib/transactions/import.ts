import type { ScrapedTransaction } from "@/lib/scraper/types";
import type { CategorySource } from "@/lib/merchant-memory";
import { sameMerchant } from "@/lib/transaction-matching";

export type StoredTransaction = {
  id: string;
  bankAccountId: string;
  externalId: string | null;
  date: string;
  processedDate: string;
  description: string;
  chargedAmount: number;
  status: "completed" | "pending";
  categoryId: string | null;
  categorySource?: CategorySource | null;
  customDescription?: string | null;
  reconciliationGroupId?: string | null;
};

export type NewTransaction = Omit<ScrapedTransaction, ""> & {
  bankAccountId: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
};

/**
 * Categorization result for an imported transaction: the assigned category and
 * its provenance TIER (ADR-0010 §2). A rule match is `rule`; a user-tier memory
 * hit is `memory`; an ai-tier memory hit is `ai`. No category ⇒ both null.
 */
export type Categorization = {
  categoryId: string | null;
  source: CategorySource | null;
};

export type TransactionStore = {
  findByExternalId(externalId: string, bankAccountId: string): Promise<StoredTransaction | null>;
  findByComposite(
    date: string,
    chargedAmount: number,
    description: string,
    bankAccountId: string,
  ): Promise<StoredTransaction | null>;
  /** Pending rows with no `externalId` on the account, dated in [fromDate, toDate] inclusive. */
  findOpenPending(
    bankAccountId: string,
    fromDate: string,
    toDate: string,
  ): Promise<StoredTransaction[]>;
  insert(tx: NewTransaction): Promise<string>;
  update(
    id: string,
    changes: Partial<
      Pick<
        StoredTransaction,
        "status" | "processedDate" | "chargedAmount" | "externalId" | "date" | "description"
      >
    >,
  ): Promise<void>;
};

/** How far a bank may move a charge's date between its pending and posted versions. */
export const PENDING_TAKEOVER_WINDOW_DAYS = 7;

export type ImportOutcome = "inserted" | "updated" | "skipped";

const DAY_MS = 86_400_000;

/**
 * The library emits full ISO timestamps (`2026-10-14T21:00:00.000Z`); Postgres
 * stores a `date` column's calendar part, ignoring time and zone. Every date
 * compared or queried here is reduced the same way, or `Date.parse` yields NaN.
 */
export function calendarDate(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${calendarDate(isoDate)}T00:00:00Z`) / DAY_MS);
}

export function shiftDate(isoDate: string, days: number): string {
  return new Date((dayNumber(isoDate) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Lower is stronger: exact, then description-only, then amount-only. */
function matchTier(
  tx: Pick<ScrapedTransaction, "chargedAmount" | "description">,
  c: StoredTransaction,
): number | null {
  const sameAmount = c.chargedAmount === tx.chargedAmount;
  const sameDescription = c.description === tx.description;
  if (sameAmount && sameDescription) return 0;
  if (sameDescription) return 1;
  // Amounts collide across unrelated merchants, so amount alone needs the same merchant.
  if (sameAmount && sameMerchant(c.description, tx.description)) return 2;
  return null;
}

/**
 * The open pending row a posted charge supersedes (CONTEXT.md "pending
 * lifecycle"): the strongest match tier wins, then the closest date. Banks
 * alter the amount or the description on posting, rarely both.
 */
export function pickPendingTakeover(
  tx: Pick<ScrapedTransaction, "date" | "chargedAmount" | "description">,
  candidates: StoredTransaction[],
): StoredTransaction | null {
  let best: StoredTransaction | null = null;
  let bestRank: [number, number] = [Infinity, Infinity];
  for (const c of candidates) {
    if (c.status !== "pending" || c.externalId !== null) continue;
    const tier = matchTier(tx, c);
    if (tier === null) continue;
    const gap = Math.abs(dayNumber(c.date) - dayNumber(tx.date));
    if (gap > PENDING_TAKEOVER_WINDOW_DAYS) continue;
    if (tier < bestRank[0] || (tier === bestRank[0] && gap < bestRank[1])) {
      best = c;
      bestRank = [tier, gap];
    }
  }
  return best;
}

/**
 * `importTransaction` plus the id of the row the transaction now lives in
 * (matched, taken over or inserted) — the pending sweep's "seen" set.
 */
export async function resolveImport(
  tx: ScrapedTransaction,
  bankAccountId: string,
  store: TransactionStore,
  categorize: (desc: string) => Promise<Categorization>,
  claimedIds: ReadonlySet<string> = new Set(),
): Promise<{ outcome: ImportOutcome; id: string }> {
  // 1. Try external_id match
  if (tx.externalId) {
    const existing = await store.findByExternalId(tx.externalId, bankAccountId);
    if (existing) {
      if (existing.status === "pending" && tx.status === "completed") {
        await store.update(existing.id, {
          status: "completed",
          processedDate: tx.processedDate,
          chargedAmount: tx.chargedAmount,
        });
        return { outcome: "updated", id: existing.id };
      }
      return { outcome: "skipped", id: existing.id };
    }
  }

  // 2. Composite fallback for null externalId
  if (!tx.externalId) {
    const existing = await store.findByComposite(
      tx.date,
      tx.chargedAmount,
      tx.description,
      bankAccountId,
    );
    if (existing) {
      if (existing.status === "pending" && tx.status === "completed") {
        await store.update(existing.id, {
          status: "completed",
          processedDate: tx.processedDate,
          chargedAmount: tx.chargedAmount,
        });
        return { outcome: "updated", id: existing.id };
      }
      return { outcome: "skipped", id: existing.id };
    }
  }

  // 3. A posted charge supersedes its pending twin in place, so the user's
  // category and custom description on the pending row survive.
  if (tx.status === "completed") {
    const candidates = await store.findOpenPending(
      bankAccountId,
      shiftDate(tx.date, -PENDING_TAKEOVER_WINDOW_DAYS),
      shiftDate(tx.date, PENDING_TAKEOVER_WINDOW_DAYS),
    );
    // A row this scrape already resolved to is a different charge, not a twin.
    const pending = pickPendingTakeover(
      tx,
      candidates.filter((c) => !claimedIds.has(c.id)),
    );
    if (pending) {
      await store.update(pending.id, {
        status: "completed",
        externalId: tx.externalId,
        date: tx.date,
        processedDate: tx.processedDate,
        chargedAmount: tx.chargedAmount,
        description: tx.description,
      });
      return { outcome: "updated", id: pending.id };
    }
  }

  // 4. New transaction — auto-categorize and insert
  const { categoryId, source } = await categorize(tx.description);
  const id = await store.insert({ ...tx, bankAccountId, categoryId, categorySource: source });
  return { outcome: "inserted", id };
}

export async function importTransaction(
  tx: ScrapedTransaction,
  bankAccountId: string,
  store: TransactionStore,
  categorize: (desc: string) => Promise<Categorization>,
): Promise<ImportOutcome> {
  return (await resolveImport(tx, bankAccountId, store, categorize)).outcome;
}
