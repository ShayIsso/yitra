import type { TransactionStore, StoredTransaction } from "../import";
import type { PendingSweepStore } from "../sweep";

export function createMemoryStore(
  initial: StoredTransaction[] = [],
): TransactionStore & { rows: StoredTransaction[] } {
  const rows: StoredTransaction[] = [...initial];
  let nextId = 1;

  return {
    rows,
    async findByExternalId(externalId, bankAccountId) {
      return (
        rows.find((r) => r.externalId === externalId && r.bankAccountId === bankAccountId) ?? null
      );
    },
    async findByComposite(date, chargedAmount, description, bankAccountId) {
      return (
        rows.find(
          (r) =>
            r.date === date &&
            r.chargedAmount === chargedAmount &&
            r.description === description &&
            r.bankAccountId === bankAccountId,
        ) ?? null
      );
    },
    async findOpenPending(bankAccountId, fromDate, toDate) {
      return rows.filter(
        (r) =>
          r.bankAccountId === bankAccountId &&
          r.status === "pending" &&
          r.externalId === null &&
          r.date >= fromDate &&
          r.date <= toDate,
      );
    },
    async insert(tx) {
      const id = String(nextId++);
      rows.push({ ...tx, id });
      return id;
    },
    async update(id, changes) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) Object.assign(rows[idx], changes);
    },
  };
}

export function createMemorySweepStore(rows: StoredTransaction[]): PendingSweepStore {
  return {
    async findPendingIds(bankAccountId, fromDate) {
      return rows
        .filter(
          (r) => r.bankAccountId === bankAccountId && r.status === "pending" && r.date >= fromDate,
        )
        .map((r) => r.id);
    },
    async deleteTransactions(ids) {
      for (const id of ids) {
        const idx = rows.findIndex((r) => r.id === id);
        if (idx !== -1) rows.splice(idx, 1);
      }
    },
  };
}
