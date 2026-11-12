import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  getMonthTransactionDetails,
  getRollupCategories,
  monthPosition,
  previousMonth,
  toTransactionWithCategory,
  type MonthTransactionDetail,
} from "@/lib/analytics";
import {
  buildHomeTrends,
  getTrendsReport,
  homeTrendWindowEnd,
  HOME_TREND_MONTHS,
  type HomeTrendRow,
} from "@/lib/reports";
import { formatZodError } from "@/lib/api-utils";
import { OUTLOOK_FIRST_YEAR, OUTLOOK_LAST_YEAR } from "@/lib/budgets/outlook-range";
import { israelCalendarDay } from "@/lib/calendar";

const querySchema = z.object({
  year: z.coerce
    .number({ message: "שנה לא תקינה" })
    .int("שנה לא תקינה")
    .min(OUTLOOK_FIRST_YEAR, "שנה לא תקינה")
    .max(OUTLOOK_LAST_YEAR, "שנה לא תקינה"),
  month: z.coerce
    .number({ message: "חודש לא תקין" })
    .int("חודש לא תקין")
    .min(1, "חודש לא תקין")
    .max(12, "חודש לא תקין"),
});

const toRow = (r: MonthTransactionDetail): HomeTrendRow => ({
  ...toTransactionWithCategory(r),
  date: r.date,
  reconciliationRole: r.reconciliationRole,
});

/**
 * The home screen's trend sections (#320) for one month: stat tiles, the
 * ranked category list and the twelve-month chart, in one request composed
 * from the analytics and reports reads.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selected = querySchema.parse(Object.fromEntries(searchParams));
    // The home calendar day, the same "today" the outlook and the insights use.
    const today = israelCalendarDay(new Date());
    if (monthPosition(selected, today).phase === "not-started") {
      return NextResponse.json({ error: "החודש עוד לא התחיל" }, { status: 400 });
    }
    const [year, month] = today.split("-").map(Number);
    const end = homeTrendWindowEnd(selected, { year, month });
    const previous = previousMonth(selected);

    const [trend, monthRows, previousRows, categories] = await Promise.all([
      getTrendsReport(
        HOME_TREND_MONTHS,
        undefined,
        `${end.year}-${String(end.month).padStart(2, "0")}-01`,
      ),
      getMonthTransactionDetails(selected.year, selected.month),
      getMonthTransactionDetails(previous.year, previous.month),
      getRollupCategories(),
    ]);

    return NextResponse.json(
      buildHomeTrends({
        month: selected,
        today,
        trend,
        rows: { month: monthRows.map(toRow), previous: previousRows.map(toRow) },
        categories,
      }),
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
