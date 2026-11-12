import { cache } from "react";
import { homeMonthOf, homeMonthRange, type MonthRange } from "@/components/home/month";
import { getReportMonths } from "@/lib/reports";

const readMonthsWithData = cache(() => getReportMonths());

/**
 * The home screen's browsable months, read once per request: the dashboard
 * layout hands them to the shell (the command palette's months) and the home
 * page to its month navigation, so a request renders both from one read. The
 * shell's copy lives as long as the layout render, like the pending badge:
 * until a full load or `router.refresh()` (home refreshes after a sync).
 */
export const getHomeMonthRange = cache(
  async (): Promise<MonthRange> =>
    homeMonthRange(await readMonthsWithData(), homeMonthOf(new Date())),
);

/** Whether any transaction is stored, from the same months read as the range. */
export async function hasStoredTransactions(): Promise<boolean> {
  return (await readMonthsWithData()).length > 0;
}
