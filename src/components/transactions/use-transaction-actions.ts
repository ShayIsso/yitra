"use client";

import * as React from "react";
import { undoReconciliationAction } from "@/app/actions/reconciliation";
import {
  updateTransactionAction,
  bulkCategorizeAction,
  undoFanOutAction,
} from "@/app/actions/transactions";
import {
  acceptSuggestionAction,
  rejectSuggestionAction,
  undoAiAssignmentAction,
} from "@/app/actions/ai-review";
import type { FannedOutRow } from "@/lib/merchant-memory";
import type { Transaction } from "./types";

type UpdateRows = (fn: (rows: Transaction[]) => Transaction[]) => void;

function patchRow(id: string, patch: Partial<Transaction>) {
  return (rows: Transaction[]) => rows.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

/**
 * Every write the page can make, each through its existing Server Action,
 * mirrored onto the rows on screen once the action succeeds. A failed action
 * leaves the rows untouched and surfaces its message in `error`.
 */
export function useTransactionActions(updateRows: UpdateRows) {
  const [fanOut, setFanOut] = React.useState<FannedOutRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function settle<R extends { error?: string }>(result: R): result is R & { error?: undefined } {
    if (result.error) {
      setError(result.error);
      return false;
    }
    setError(null);
    return true;
  }

  // After an assignment, merchant memory applies the choice to same-key rows
  // (ADR-0010 §4): a count with one-click undo, not a confirmation. Siblings
  // get provenance 'memory' — automation applying a user-tier entry.
  function applyFanOut(categoryId: string, fannedOut: FannedOutRow[] | undefined) {
    if (fannedOut && fannedOut.length > 0) {
      const ids = new Set(fannedOut.map((r) => r.id));
      updateRows((rows) =>
        rows.map((t) => (ids.has(t.id) ? { ...t, categoryId, categorySource: "memory" } : t)),
      );
      setFanOut(fannedOut);
    } else {
      setFanOut(null);
    }
  }

  async function assignCategory(id: string, categoryId: string) {
    const result = await updateTransactionAction({ id, categoryId });
    if (!settle(result)) return;
    // First label and correction both land on 'user', clearing any AI marker.
    updateRows(patchRow(id, { categoryId, categorySource: "user" }));
    applyFanOut(categoryId, result.fannedOut);
  }

  /** `null` clears the custom description; the bank's `description` is never edited. */
  async function saveDescription(id: string, customDescription: string | null) {
    const result = await updateTransactionAction({ id, customDescription });
    if (!settle(result)) return false;
    updateRows(patchRow(id, { customDescription }));
    return true;
  }

  async function acceptSuggestion(tx: Transaction) {
    const suggestion = tx.pendingSuggestion;
    if (!suggestion) return;
    const result = await acceptSuggestionAction({
      transactionId: tx.id,
      suggestionId: suggestion.suggestionId,
    });
    if (!settle(result) || !result.accepted) return;
    updateRows(
      patchRow(tx.id, {
        categoryId: suggestion.categoryId,
        categorySource: "user",
        pendingSuggestion: null,
      }),
    );
    applyFanOut(suggestion.categoryId, result.fannedOut);
  }

  async function rejectSuggestion(tx: Transaction) {
    const suggestion = tx.pendingSuggestion;
    if (!suggestion) return;
    const result = await rejectSuggestionAction({ suggestionId: suggestion.suggestionId });
    if (!settle(result) || !result.rejected) return;
    updateRows(patchRow(tx.id, { pendingSuggestion: null }));
  }

  async function undoAiAssignment(tx: Transaction) {
    const result = await undoAiAssignmentAction({ transactionId: tx.id });
    if (!settle(result) || !result.undone) return;
    updateRows(patchRow(tx.id, { categoryId: null, categorySource: null }));
  }

  async function undoReconciliation(id: string) {
    const result = await undoReconciliationAction({ txnId: id });
    if (!settle(result)) return;
    updateRows(patchRow(id, { reconciliationGroupId: null, reconciliationConfirmedAt: null }));
  }

  async function bulkCategorize(ids: string[], categoryId: string) {
    const result = await bulkCategorizeAction({ transactionIds: ids, categoryId });
    if (!settle(result)) return false;
    const chosen = new Set(ids);
    updateRows((rows) =>
      rows.map((t) => (chosen.has(t.id) ? { ...t, categoryId, categorySource: "user" } : t)),
    );
    applyFanOut(categoryId, result.fannedOut);
    return true;
  }

  async function undoFanOut() {
    if (!fanOut) return;
    const rows = fanOut;
    const result = await undoFanOutAction({ rows });
    if (!settle(result)) return;
    const restored = new Map(rows.map((r) => [r.id, r]));
    updateRows((current) =>
      current.map((t) => {
        const r = restored.get(t.id);
        return r
          ? { ...t, categoryId: r.previousCategoryId, categorySource: r.previousCategorySource }
          : t;
      }),
    );
    setFanOut(null);
  }

  return {
    fanOutCount: fanOut?.length ?? 0,
    dismissFanOut: () => setFanOut(null),
    undoFanOut,
    error,
    dismissError: () => setError(null),
    assignCategory,
    saveDescription,
    acceptSuggestion,
    rejectSuggestion,
    undoAiAssignment,
    undoReconciliation,
    bulkCategorize,
  };
}

export type TransactionActions = ReturnType<typeof useTransactionActions>;
