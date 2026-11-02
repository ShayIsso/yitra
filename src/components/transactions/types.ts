/** One row of `GET /api/transactions` as the page receives it (JSON). */
export type Transaction = {
  id: string;
  bankAccountId: string;
  date: string;
  processedDate: string | null;
  description: string;
  customDescription: string | null;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  /** Set only when the purchase was in another currency (`originalCharge`). */
  originalCharge: { amount: number; currency: string } | null;
  type: "normal" | "installments";
  installmentNumber: number | null;
  installmentTotal: number | null;
  status: "completed" | "pending";
  categoryId: string | null;
  categorySource: "rule" | "memory" | "ai" | "user" | null;
  reconciliationGroupId: string | null;
  reconciliationConfirmedAt: string | null;
  recurringExpense: {
    id: string;
    merchant: string;
    cadence: "monthly" | "quarterly" | "annual";
  } | null;
  pendingSuggestion: {
    suggestionId: string;
    categoryId: string;
    categoryName: string;
    confidence: number;
  } | null;
};

export type TransactionsResponse = {
  data: Transaction[];
  total: number;
  page: number;
  pageSize: number;
};
