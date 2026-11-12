import type { MonthOutlook } from "@/lib/budgets";

/**
 * The month outlook as `/api/month-outlook` sends it: dates arrive as ISO
 * strings. The hero renders these figures and never recomputes money; the
 * helpers here only pick and arrange returned fields.
 */
type Jsonified<T> = T extends unknown
  ? { [K in keyof T]: T[K] extends Date ? string : T[K] }
  : never;

export type OutlookResponse = Jsonified<MonthOutlook>;
export type OutlookOf<S extends OutlookResponse["state"]> = Extract<OutlookResponse, { state: S }>;
export type ActiveOutlook = OutlookOf<"active">;
export type ClosedOutlook = OutlookOf<"closed">;

export type ClosedVerdict = {
  balance: "surplus" | "deficit" | "even" | "empty";
  /** How far income and expenses ended apart: the net's size, its sign told in words. */
  by: number;
  target: null | { over: number } | { within: number };
};

/** The closed month's one-sentence verdict, in parts the hero puts into words. */
export function closedVerdict(o: ClosedOutlook): ClosedVerdict {
  const balance =
    o.income === 0 && o.expenses === 0
      ? "empty"
      : o.net > 0
        ? "surplus"
        : o.net < 0
          ? "deficit"
          : "even";
  const target =
    o.target === null ? null : o.overBy !== null ? { over: o.overBy } : { within: o.target };
  // A display magnitude, not a total: the sign is told in words (`balance`).
  return { balance, by: Math.abs(o.net), target };
}

export type EquationTerm =
  | { term: "target" | "spent" | "remaining"; amount: number }
  | { term: "due"; amount: number; count: number; late: number };

/** יעד − יצא − קבועים = נשאר, exactly as the outlook computed it. */
export function equationTerms(o: ActiveOutlook): EquationTerm[] {
  return [
    { term: "target", amount: o.target },
    { term: "spent", amount: o.spent },
    {
      term: "due",
      amount: o.dueRecurring,
      count: o.dueCharges.length,
      late: o.dueCharges.filter((c) => c.late).length,
    },
    { term: "remaining", amount: o.remaining },
  ];
}
