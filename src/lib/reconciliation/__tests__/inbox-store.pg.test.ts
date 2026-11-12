import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { approveGroup, rejectGroup, undoTransaction } from "../inbox-ops";
import { drizzleInboxStore } from "../inbox-store";
import { drizzleSuspectedTransferRouter } from "../suspected-transfer";

/**
 * Queueing and approving through the real Drizzle router and inbox store. Skipped unless
 * `YITRA_PG_TEST_URL` names a migrated throwaway database whose name starts with
 * `yitra_wt` or `yitra_it`; it deletes every bank credential (and so every
 * transaction) and every merchant-memory entry, so it refuses any other name.
 *
 *   docker exec yitra-db-1 createdb -U yitra yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run inbox-store.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

// The store writes through the app's `db`; point it at the throwaway database.
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const s = await import("@/db/schema");
  const client = postgres(process.env.YITRA_PG_TEST_URL ?? "postgres://unused@localhost/none", {
    max: 2,
  });
  return { db: drizzle(client, { schema: s }), client };
});

const GROUP = "00000000-0000-4000-8000-0000000000a1";
const ROW = "00000000-0000-4000-8000-000000000011";

describe.skipIf(!isThrowaway)("the suspected-transfer inbox on Postgres", () => {
  let db: Awaited<typeof import("@/db")>["db"];
  let transferCategoryId: string;
  let incomeCategoryId: string;
  let settlementCategoryId: string;

  beforeEach(async () => {
    ({ db } = await import("@/db"));
    await db.execute(sql`delete from bank_credentials`);
    await db.execute(sql`delete from merchant_memory`);
    await db.execute(
      sql`delete from categories where name in ('העברה פנימית', 'synthetic income', 'הסדרה - כרטיס אשראי')`,
    );
    [{ id: transferCategoryId }] = await db
      .insert(schema.categories)
      .values({ name: "העברה פנימית", type: "transfer", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    [{ id: settlementCategoryId }] = await db
      .insert(schema.categories)
      .values({ name: "הסדרה - כרטיס אשראי", type: "transfer", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    [{ id: incomeCategoryId }] = await db
      .insert(schema.categories)
      .values({ name: "synthetic income", type: "income", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    const [credential] = await db
      .insert(schema.bankCredentials)
      .values({
        bankType: "discount",
        displayName: "synthetic",
        encryptedCredentials: Buffer.from("x"),
        iv: Buffer.from("x"),
        authTag: Buffer.from("x"),
      })
      .returning({ id: schema.bankCredentials.id });
    const [account] = await db
      .insert(schema.bankAccounts)
      .values({ credentialId: credential.id, accountNumber: "000" })
      .returning({ id: schema.bankAccounts.id });
    await db.insert(schema.transactions).values({
      id: ROW,
      bankAccountId: account.id,
      date: "2026-03-10",
      processedDate: "2026-03-10",
      description: "העברה לחשבון שלי",
      originalAmount: "-800.00",
      originalCurrency: "ILS",
      chargedAmount: "-800.00",
      type: "normal",
      status: "completed",
      reconciliationGroupId: GROUP,
      reconciliationRole: "transfer_pair",
      reconciliationConfidence: 0.5,
    });
  });

  afterAll(async () => {
    if (!isThrowaway) return;
    const { db: d, client } = (await import("@/db")) as unknown as {
      db: typeof db;
      client: { end(): Promise<void> };
    };
    await d.execute(sql`delete from bank_credentials`);
    await d.execute(sql`delete from categories where name in ('העברה פנימית', 'synthetic income')`);
    await client.end();
  });

  const stored = async () =>
    (await db.select().from(schema.transactions).where(eq(schema.transactions.id, ROW)))[0];

  const unqueue = (chargedAmount: string) =>
    db
      .update(schema.transactions)
      .set({
        chargedAmount,
        originalAmount: chargedAmount,
        reconciliationGroupId: null,
        reconciliationRole: null,
        reconciliationConfidence: null,
      })
      .where(eq(schema.transactions.id, ROW));

  it.each(["-800.00", "0.00"])(
    "the router queues an unpaired row of %s as a suspected transfer",
    async (amount) => {
      await unqueue(amount);

      await drizzleSuspectedTransferRouter.queueSuspectedTransfer(ROW);

      expect(await stored()).toMatchObject({
        reconciliationRole: "transfer_pair",
        reconciliationConfidence: 0.5,
      });
    },
  );

  it("the router never queues a credit, whoever calls it", async () => {
    await unqueue("12000.00");

    await drizzleSuspectedTransferRouter.queueSuspectedTransfer(ROW);

    expect((await stored()).reconciliationGroupId).toBeNull();
  });

  it("records the internal transfer as the user's decision and writes no merchant memory", async () => {
    expect(await approveGroup(GROUP, drizzleInboxStore)).toEqual({});

    const row = await stored();
    expect(row.reconciliationConfirmedAt).not.toBeNull();
    expect(row.categoryId).toBe(transferCategoryId);
    expect(row.categorySource).toBe("user");
    expect(await db.select().from(schema.merchantMemory)).toEqual([]);
  });

  it("keeps a category the user chose between the approve's read and its confirm", async () => {
    await db
      .update(schema.transactions)
      .set({ categoryId: incomeCategoryId, categorySource: "memory" })
      .where(eq(schema.transactions.id, ROW));

    await drizzleInboxStore.confirmGroup(GROUP, new Date(), [
      {
        txnId: ROW,
        categoryId: transferCategoryId,
        categorySource: "user",
        keepUserCategory: true,
      },
    ]);

    const row = await stored();
    expect(row.reconciliationConfirmedAt).not.toBeNull();
    expect(row.categoryId).toBe(incomeCategoryId);
    expect(row.categorySource).toBe("memory");
  });

  describe("an own-account transfer pair (P3)", () => {
    const INCOMING = "00000000-0000-4000-8000-000000000012";

    const addIncomingLeg = async () => {
      const [{ bankAccountId }] = await db
        .select({ bankAccountId: schema.transactions.bankAccountId })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, ROW));
      const [{ credentialId }] = await db
        .select({ credentialId: schema.bankAccounts.credentialId })
        .from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.id, bankAccountId));
      const [other] = await db
        .insert(schema.bankAccounts)
        .values({ credentialId, accountNumber: "111" })
        .returning({ id: schema.bankAccounts.id });
      await db.insert(schema.transactions).values({
        id: INCOMING,
        bankAccountId: other.id,
        date: "2026-03-10",
        processedDate: "2026-03-10",
        description: "העברה לחשבון שלי",
        originalAmount: "800.00",
        originalCurrency: "ILS",
        chargedAmount: "800.00",
        type: "normal",
        status: "completed",
        reconciliationGroupId: GROUP,
        reconciliationRole: "transfer_pair",
        reconciliationConfidence: 0.9,
      });
    };

    const storedLeg = async (id: string) =>
      (await db.select().from(schema.transactions).where(eq(schema.transactions.id, id)))[0];

    it("approving flips both legs to internal transfers as the user's decision", async () => {
      await addIncomingLeg();

      await approveGroup(GROUP, drizzleInboxStore);

      for (const id of [ROW, INCOMING]) {
        const leg = await storedLeg(id);
        expect(leg.categoryId).toBe(transferCategoryId);
        expect(leg.categorySource).toBe("user");
        expect(leg.reconciliationConfirmedAt).not.toBeNull();
      }
    });

    it("undoing the approved pair releases both legs' internal-transfer category", async () => {
      await addIncomingLeg();
      await approveGroup(GROUP, drizzleInboxStore);

      await undoTransaction(ROW, await drizzleInboxStore.getGroupMembers(GROUP), drizzleInboxStore);

      for (const id of [ROW, INCOMING]) {
        expect(await storedLeg(id)).toMatchObject({
          categoryId: null,
          reconciliationGroupId: null,
        });
      }
    });

    it("flips a leg carrying a memory category too, so no half-flip is left in the totals", async () => {
      await addIncomingLeg();
      await db
        .update(schema.transactions)
        .set({ categoryId: incomeCategoryId, categorySource: "memory" })
        .where(eq(schema.transactions.id, INCOMING));

      await approveGroup(GROUP, drizzleInboxStore);

      for (const id of [ROW, INCOMING]) {
        expect(await storedLeg(id)).toMatchObject({
          categoryId: transferCategoryId,
          categorySource: "user",
        });
      }
    });
  });

  it("keeps a category the user chose after the row was queued", async () => {
    await db
      .update(schema.transactions)
      .set({ categoryId: incomeCategoryId, categorySource: "user" })
      .where(eq(schema.transactions.id, ROW));

    await approveGroup(GROUP, drizzleInboxStore);

    const row = await stored();
    expect(row.reconciliationConfirmedAt).not.toBeNull();
    expect(row.categoryId).toBe(incomeCategoryId);
    expect(row.categorySource).toBe("user");
  });

  const seed = (categoryId: string | null, categorySource: "user" | "memory" | "rule" | null) =>
    db
      .update(schema.transactions)
      .set({ categoryId, categorySource })
      .where(eq(schema.transactions.id, ROW));

  describe("reject (unconfirmed group)", () => {
    it.each(["user", "memory"] as const)(
      "keeps a %s category, even internal transfer, whatever the caller read",
      async (source) => {
        for (const category of [incomeCategoryId, transferCategoryId]) {
          await seed(category, source);
          await drizzleInboxStore.setCategory(ROW, null, "reject");
          expect(await stored()).toMatchObject({ categoryId: category, categorySource: source });
        }
      },
    );

    it("rejecting a queued row keeps a category the user gave it", async () => {
      await seed(transferCategoryId, "user");
      await rejectGroup(GROUP, drizzleInboxStore);
      expect(await stored()).toMatchObject({
        reconciliationGroupId: null,
        categoryId: transferCategoryId,
        categorySource: "user",
      });
    });

    it.each([null, "income"] as const)(
      "writes to a row with no provenance (category %s) and clears it again",
      async (existing) => {
        await seed(existing ? incomeCategoryId : null, null);
        await drizzleInboxStore.setCategory(ROW, incomeCategoryId, "reject");
        expect(await stored()).toMatchObject({
          categoryId: incomeCategoryId,
          categorySource: "rule",
        });
        await drizzleInboxStore.setCategory(ROW, null, "reject");
        expect(await stored()).toMatchObject({ categoryId: null, categorySource: null });
      },
    );
  });

  describe("undo (confirmed group)", () => {
    it("releases the transfer flip an approval wrote (user provenance)", async () => {
      await seed(transferCategoryId, "user");
      await drizzleInboxStore.setCategory(ROW, incomeCategoryId, "undo");
      expect(await stored()).toMatchObject({
        categoryId: incomeCategoryId,
        categorySource: "rule",
      });
    });

    it.each([
      ["transfer", () => transferCategoryId],
      ["settlement", () => settlementCategoryId],
    ])("releases an auto-applied %s category under a stale memory source", async (_n, id) => {
      await seed(id(), "memory");
      await drizzleInboxStore.setCategory(ROW, null, "undo");
      expect(await stored()).toMatchObject({ categoryId: null, categorySource: null });
    });

    it.each(["user", "memory"] as const)(
      "keeps a %s category unrelated to reconciliation",
      async (source) => {
        await seed(incomeCategoryId, source);
        await drizzleInboxStore.setCategory(ROW, null, "undo");
        expect(await stored()).toMatchObject({
          categoryId: incomeCategoryId,
          categorySource: source,
        });
      },
    );
  });

  describe("open AI suggestions", () => {
    const suggest = () =>
      db.insert(schema.aiSuggestions).values({
        transactionId: ROW,
        categoryId: incomeCategoryId,
        confidence: 4,
        model: "synthetic",
        status: "pending_review",
      });
    const statuses = async () =>
      (await db.select({ s: schema.aiSuggestions.status }).from(schema.aiSuggestions)).map(
        (r) => r.s,
      );

    it("stay open when the guard skips the write", async () => {
      await seed(incomeCategoryId, "user");
      await suggest();
      await drizzleInboxStore.setCategory(ROW, transferCategoryId, "reject");
      expect(await statuses()).toEqual(["pending_review"]);
    });

    it("are superseded when the row is written", async () => {
      await seed(null, null);
      await suggest();
      await drizzleInboxStore.setCategory(ROW, transferCategoryId, "reject");
      expect(await statuses()).toEqual(["superseded"]);
    });
  });
});
