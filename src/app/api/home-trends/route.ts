import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  getRollupCategories,
  getTransactionDetailsBetween,
  monthPosition,
  toTransactionWithCategory,
} from "@/lib/analytics";
import { getHistoryCompleteSince } from "@/lib/budgets";
import { buildHomeTrends, homeTrendRange } from "@/lib/reports";
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

/**
 * The home screen's trend sections (#320) for one month: stat tiles, the
 * ranked category list and the twelve-month chart, in one request. One range
 * read covers every month the builder needs; the categories and the history
 * coverage are read once beside it.
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
    const { from, to } = homeTrendRange(selected, today);
    const [rows, categories, historyCompleteSince] = await Promise.all([
      getTransactionDetailsBetween(from, to),
      getRollupCategories(),
      getHistoryCompleteSince(),
    ]);

    return NextResponse.json(
      buildHomeTrends({
        month: selected,
        today,
        rows: rows.map((r) => ({ ...toTransactionWithCategory(r), date: r.date })),
        categories,
        historyCompleteSince,
      }),
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
