import type { CardDebitFact, Insight, InsightMonth } from "@/lib/analytics/insights";
import { transactionsHref } from "@/lib/transactions/view-params";
import { monthKey } from "@/components/reports/format";

/*
 * How the home insight cards present what `/api/insights` selected. The
 * selection, its order and every figure come from the server; these helpers
 * only pick where a card leads and how loudly it speaks.
 */

/**
 * Where tapping a card leads: straight to the thing it is about, already
 * filtered. Null for a card with nothing to open.
 */
export function insightHref(insight: Insight, month: InsightMonth): string | null {
  switch (insight.kind) {
    case "uncategorized":
      return transactionsHref({ uncategorized: true });
    case "needs-review":
      return transactionsHref({ needsReview: true });
    case "budget-risk":
      // Riskiest first (insight selection's order); the filter covers the subtree.
      return transactionsHref({
        categoryId: insight.budgets[0].categoryId,
        month: monthKey(month),
      });
    case "category-jump":
      return transactionsHref({ categoryId: insight.categoryId, month: monthKey(month) });
    case "biggest-expense":
      // No per-transaction link exists; its day is the narrowest view holding it.
      return transactionsHref({ dateFrom: insight.date, dateTo: insight.date });
    case "upcoming-recurring":
      return "/subscriptions";
    case "card-debit":
    case "recap":
      return null;
  }
}

/** Coral is attention only (ADR-0015): of the insight cards, only budgets over or at risk. */
export function isAttentionInsight(insight: Insight): boolean {
  return insight.kind === "budget-risk";
}

/** Card lines a debit card fits before the rest fold into "and N more". */
const CARD_DEBIT_LINES = 2;

/**
 * The card-debit breakdown. Cards charge on different dates, so each line
 * keeps its own; the card never states one combined date.
 */
export function cardDebitLines(cards: readonly CardDebitFact[]): {
  shown: CardDebitFact[];
  more: number;
} {
  return {
    shown: cards.slice(0, CARD_DEBIT_LINES),
    more: Math.max(0, cards.length - CARD_DEBIT_LINES),
  };
}
