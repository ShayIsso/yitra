import type { CategorySource } from "@/lib/merchant-memory";
import { calendarDate, PENDING_TAKEOVER_WINDOW_DAYS, type StoredTransaction } from "./import";

export type SweepCarryover = {
  completedId: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
  customDescription: string | null;
};

/** What the executor must do, decided without touching the DB. */
export type SweepPlan = {
  deleteIds: string[];
  carryovers: SweepCarryover[];
  /** Groups that lost a member; the executor clears them on the survivors. */
  releaseGroupIds: string[];
};

export type PendingSweepStore = {
  /** Every `pending` row of the account. */
  findPendingRows(bankAccountId: string): Promise<StoredTransaction[]>;
  /** `completed` rows of the account dated on or after `fromDate`. */
  findCompletedRows(bankAccountId: string, fromDate: string): Promise<StoredTransaction[]>;
  /** Applies the plan atomically; deletes only rows still `pending`. */
  applySweep(plan: SweepPlan): Promise<void>;
};

const DAY_MS = 86_400_000;

function dayGap(a: string, b: string): number {
  return Math.abs(
    (Date.parse(`${calendarDate(a)}T00:00:00Z`) - Date.parse(`${calendarDate(b)}T00:00:00Z`)) /
      DAY_MS,
  );
}

function shiftDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${calendarDate(isoDate)}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Overwrite law (ADR-0010): only trusted-tier assignments survive onto a posted row. */
function carriesCategory(row: StoredTransaction): boolean {
  return row.categoryId !== null && row.categorySource != null && row.categorySource !== "ai";
}

function acceptsCategory(row: StoredTransaction): boolean {
  return row.categoryId === null || row.categorySource === "ai" || row.categorySource == null;
}

function exactTwin(
  pending: StoredTransaction,
  completed: StoredTransaction[],
  taken: ReadonlySet<string>,
): StoredTransaction | null {
  let best: StoredTransaction | null = null;
  let bestGap = Infinity;
  for (const c of completed) {
    if (taken.has(c.id)) continue;
    if (c.chargedAmount !== pending.chargedAmount || c.description !== pending.description)
      continue;
    const gap = dayGap(c.date, pending.date);
    if (gap > PENDING_TAKEOVER_WINDOW_DAYS || gap >= bestGap) continue;
    best = c;
    bestGap = gap;
  }
  return best;
}

/**
 * Decides which pending rows go and what their exact completed twins inherit
 * (CONTEXT.md "pending lifecycle"):
 *  - an in-window pending row the scrape did not resolve to is stale, but only
 *    when this scrape reported pending rows for the account (`reportedPending`):
 *    the library silently drops pending fetches on an otherwise successful scrape;
 *  - a pending row dated before the window with an exact completed twin
 *    (same amount and description, within the takeover window) is removed
 *    regardless of `reportedPending`. The twin is stored proof that the charge
 *    posted, so this relies on evidence, not on the scrape's absence of the row.
 * A removed row's trusted category, `category_source` and `custom_description`
 * move to its twin when the twin has none.
 */
export function planPendingSweep(args: {
  pending: StoredTransaction[];
  completed: StoredTransaction[];
  seenIds: ReadonlySet<string>;
  windowStart: string;
  reportedPending: boolean;
}): SweepPlan {
  const { pending, completed, seenIds, windowStart, reportedPending } = args;
  const deleteIds: string[] = [];
  const carryovers: SweepCarryover[] = [];
  const releaseGroups = new Set<string>();
  const taken = new Set<string>();

  for (const row of pending) {
    const inWindow = calendarDate(row.date) >= windowStart;
    const twin = exactTwin(row, completed, taken);
    const stale = inWindow ? reportedPending && !seenIds.has(row.id) : twin !== null;
    if (!stale) continue;

    deleteIds.push(row.id);
    if (row.reconciliationGroupId) releaseGroups.add(row.reconciliationGroupId);

    if (twin) {
      taken.add(twin.id);
      const category = carriesCategory(row) && acceptsCategory(twin);
      const custom =
        row.customDescription && !twin.customDescription ? row.customDescription : null;
      if (category || custom) {
        carryovers.push({
          completedId: twin.id,
          categoryId: category ? row.categoryId : null,
          categorySource: category ? (row.categorySource ?? null) : null,
          customDescription: custom,
        });
      }
    }
  }

  return { deleteIds, carryovers, releaseGroupIds: [...releaseGroups] };
}

/**
 * Callers must only invoke this after the account's import completed without
 * error. `seenIds` are the rows every scraped transaction resolved to (matched,
 * taken over or inserted), so a still-pending charge is protected by identity,
 * not by a stored id.
 */
export async function sweepStalePending(args: {
  bankAccountId: string;
  windowStart: string;
  seenIds: ReadonlySet<string>;
  reportedPending: boolean;
  store: PendingSweepStore;
}): Promise<number> {
  const { bankAccountId, windowStart, seenIds, reportedPending, store } = args;
  const pending = await store.findPendingRows(bankAccountId);
  if (pending.length === 0) return 0;
  const earliest = pending.map((p) => calendarDate(p.date)).sort()[0];
  const completed = await store.findCompletedRows(
    bankAccountId,
    shiftDays(earliest, -PENDING_TAKEOVER_WINDOW_DAYS),
  );
  const plan = planPendingSweep({ pending, completed, seenIds, windowStart, reportedPending });
  if (plan.deleteIds.length > 0) await store.applySweep(plan);
  return plan.deleteIds.length;
}
