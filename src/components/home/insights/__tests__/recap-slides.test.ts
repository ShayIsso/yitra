import { describe, it, expect } from "vitest";
import type { RecapFact } from "@/lib/analytics/insights";
import { headlineLine, recapSlides } from "@/components/home/insights/recap-slides";

// All names and figures invented.
function recap(over: Partial<RecapFact> = {}): RecapFact {
  return {
    month: { year: 2026, month: 10 },
    income: 15000,
    expenses: 11000,
    netSavings: 4000,
    savingsRate: 26.67,
    topCategory: {
      categoryId: "cat-food",
      name: "מזון",
      color: "#336699",
      amount: 3000,
      share: 0.3,
    },
    biggestChange: { categoryId: "cat-fun", name: "פנאי", amount: 900, previous: 400 },
    mostExpensiveDay: { date: "2026-10-14", amount: 2100, topDescription: "חנות לדוגמה" },
    recurring: { count: 5, monthlyTotal: 640 },
    verdict: { target: 12000, over: false, by: 1000 },
    ...over,
  };
}

describe("recapSlides", () => {
  it("tells the whole story in order, ending on the verdict", () => {
    expect(recapSlides(recap()).map((s) => s.kind)).toEqual([
      "headline",
      "top-category",
      "biggest-change",
      "most-expensive-day",
      "recurring",
      "verdict",
    ]);
  });

  it("carries the aggregate's figures through unchanged", () => {
    const slides = recapSlides(recap());
    expect(slides[0]).toEqual({
      kind: "headline",
      income: 15000,
      expenses: 11000,
      netSavings: 4000,
      savingsRate: 26.67,
    });
    expect(slides[1]).toEqual({
      kind: "top-category",
      name: "מזון",
      color: "#336699",
      amount: 3000,
      share: 0.3,
    });
  });

  it("names the direction of the biggest change", () => {
    const up = recapSlides(recap()).find((s) => s.kind === "biggest-change");
    expect(up).toMatchObject({ direction: "up", amount: 900, previous: 400 });
    const down = recapSlides(
      recap({ biggestChange: { categoryId: "c", name: "פנאי", amount: 100, previous: 400 } }),
    ).find((s) => s.kind === "biggest-change");
    expect(down).toMatchObject({ direction: "down" });
  });

  it("skips the parts a month has nothing to say about", () => {
    const slides = recapSlides(
      recap({
        topCategory: null,
        biggestChange: null,
        mostExpensiveDay: null,
        recurring: { count: 0, monthlyTotal: 0 },
      }),
    );
    expect(slides.map((s) => s.kind)).toEqual(["headline", "verdict"]);
  });

  it("still closes on a verdict slide when no expense target is set", () => {
    expect(recapSlides(recap({ verdict: null })).at(-1)).toEqual({
      kind: "verdict",
      verdict: null,
    });
  });
});

describe("headlineLine", () => {
  const headline = (over: Partial<RecapFact>) => {
    const slide = recapSlides(recap(over))[0];
    if (slide.kind !== "headline") throw new Error("the story opens on the headline");
    return headlineLine(slide);
  };

  it("tells what was kept and its share of income", () => {
    expect(headline({ netSavings: 4000, savingsRate: 26.67 })).toBe("נשאר לך מההכנסות: 27% מהן.");
  });

  it("never implies income when none came in and refunds outweighed charges", () => {
    expect(headline({ income: 0, expenses: -300, netSavings: 300, savingsRate: null })).toBe(
      "לא נכנסו הכנסות, וההחזרים עלו על החיובים.",
    );
  });

  it("says more went out than came in", () => {
    expect(headline({ netSavings: -1200, savingsRate: -8 })).toBe("יצא יותר ממה שנכנס.");
  });

  it("says income and expenses cancelled out", () => {
    expect(headline({ netSavings: 0, savingsRate: 0 })).toBe("ההכנסות וההוצאות התקזזו.");
  });
});
