import { calendarDate, type TransactionStore, type StoredTransaction } from "../import";
import type { PendingSweepStore } from "../sweep";

/** Mimics Postgres: a `date` column keeps only the calendar part of an ISO timestamp. */
const castDate = calendarDate;

export function createMemoryStore(
  initial: StoredTransaction[] = [],
): TransactionStore & { rows: StoredTransaction[] } {
  const rows: StoredTransaction[] = initial.map((r) => ({ ...r, date: castDate(r.date) }));
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
            r.date === castDate(date) &&
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
          r.date >= castDate(fromDate) &&
          r.date <= castDate(toDate),
      );
    },
    async insert(tx) {
      const id = String(nextId++);
      rows.push({ ...tx, id, date: castDate(tx.date) });
      return id;
    },
    async update(id, changes) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return;
      Object.assign(rows[idx], changes);
      if (changes.date !== undefined) rows[idx].date = castDate(changes.date);
    },
  };
}

export function createMemorySweepStore(rows: StoredTransaction[]): PendingSweepStore {
  return {
    async findPendingRows(bankAccountId) {
      return rows.filter((r) => r.bankAccountId === bankAccountId && r.status === "pending");
    },
    async findCompletedRows(bankAccountId, fromDate) {
      return rows.filter(
        (r) => r.bankAccountId === bankAccountId && r.status === "completed" && r.date >= fromDate,
      );
    },
    async applySweep(plan) {
      for (const c of plan.carryovers) {
        const row = rows.find((r) => r.id === c.completedId);
        if (!row) continue;
        if (c.categoryId) {
          row.categoryId = c.categoryId;
          row.categorySource = c.categorySource;
        }
        if (c.customDescription) row.customDescription = c.customDescription;
      }
      for (const row of rows) {
        const group = row.reconciliationGroupId;
        if (group && plan.releaseGroupIds.includes(group) && !plan.deleteIds.includes(row.id)) {
          row.reconciliationGroupId = null;
        }
      }
      for (const id of plan.deleteIds) {
        const idx = rows.findIndex((r) => r.id === id && r.status === "pending");
        if (idx !== -1) rows.splice(idx, 1);
      }
    },
  };
}
