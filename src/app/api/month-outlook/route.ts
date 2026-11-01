import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getMonthOutlook } from "@/lib/budgets";
import { formatZodError } from "@/lib/api-utils";

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

// A month key compares as a string: "2026-06" < "2026-11".
const querySchema = z.object({
  month: z
    .string({ message: "יש לציין חודש" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "חודש לא תקין (YYYY-MM)", abort: true })
    .refine((key) => key >= "2000-01", "חודש לא תקין (YYYY-MM)")
    .refine((key) => key <= currentMonthKey(), "החודש עוד לא התחיל"),
});

/** The month outlook (#312): what's left of the month's expense target, as of the last sync. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { month } = querySchema.parse({ month: searchParams.get("month") ?? undefined });
    const [year, mm] = month.split("-").map(Number);
    return NextResponse.json(await getMonthOutlook(year, mm));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
