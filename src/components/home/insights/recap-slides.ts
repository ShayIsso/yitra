import type { RecapFact } from "@/lib/analytics/insights";
import { formatPercent } from "@/components/reports/format";

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

/**
 * The headline card's sentence. A positive net with no savings rate means no
 * income came in at all: refunds outweighed the month's charges, so the
 * sentence must not speak of income kept.
 */
export function headlineLine(slide: Extract<RecapSlide, { kind: "headline" }>): string {
  if (slide.netSavings < 0) return "יצא יותר ממה שנכנס.";
  if (slide.netSavings === 0) return "ההכנסות וההוצאות התקזזו.";
  if (slide.savingsRate === null) return "לא נכנסו הכנסות, וההחזרים עלו על החיובים.";
  return `נשאר לך מההכנסות: ${formatPercent(slide.savingsRate)} מהן.`;
}
