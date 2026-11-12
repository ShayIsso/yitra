import type { RecapFact } from "@/lib/analytics/insights";

/**
 * One card of the month recap story. Every figure is a field of the
 * aggregate's recap fact; nothing is recomputed here.
 */
export type RecapSlide =
  | {
      kind: "headline";
      income: number;
      expenses: number;
      netSavings: number;
      savingsRate: number | null;
    }
  | {
      kind: "top-category";
      name: string;
      color: string;
      amount: number;
      /**
       * Of the month's spend summed by category (under the spend floor), not
       * of Total Expenses: the two differ by refunds and uncategorized rows.
       */
      share: number;
    }
  | {
      kind: "biggest-change";
      name: string;
      amount: number;
      previous: number;
      direction: "up" | "down";
    }
  | { kind: "most-expensive-day"; date: string; amount: number; topDescription: string | null }
  | { kind: "recurring"; count: number; monthlyTotal: number }
  | { kind: "verdict"; verdict: RecapFact["verdict"] };

/**
 * The recap story's cards in telling order: headline numbers, biggest
 * category, biggest change, most expensive day, recurring total, verdict.
 * A part the month has nothing to say about is left out; the verdict always
 * closes the story, saying so when no expense target is set.
 */
export function recapSlides(recap: RecapFact): RecapSlide[] {
  const { income, expenses, netSavings, savingsRate } = recap;
  const slides: RecapSlide[] = [{ kind: "headline", income, expenses, netSavings, savingsRate }];
  if (recap.topCategory) {
    const { name, color, amount, share } = recap.topCategory;
    slides.push({ kind: "top-category", name, color, amount, share });
  }
  if (recap.biggestChange) {
    const { name, amount, previous } = recap.biggestChange;
    slides.push({
      kind: "biggest-change",
      name,
      amount,
      previous,
      direction: amount > previous ? "up" : "down",
    });
  }
  if (recap.mostExpensiveDay) {
    slides.push({ kind: "most-expensive-day", ...recap.mostExpensiveDay });
  }
  if (recap.recurring.count > 0) {
    slides.push({ kind: "recurring", ...recap.recurring });
  }
  slides.push({ kind: "verdict", verdict: recap.verdict });
  return slides;
}
