import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getMonthOutlook, hasOutlookMonthStarted } from "@/lib/budgets";
import { formatZodError } from "@/lib/api-utils";
import { OUTLOOK_FIRST_YEAR, OUTLOOK_LAST_YEAR } from "@/lib/budgets/outlook-range";

const querySchema = z
  .object({
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
  })
  .refine((month) => hasOutlookMonthStarted(month, new Date()), {
    message: "החודש עוד לא התחיל",
  });

/** The month outlook (#312): what's left of the month's expense target, as of the last sync. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { year, month } = querySchema.parse(Object.fromEntries(searchParams));
    return NextResponse.json(await getMonthOutlook(year, month));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
