import { cache } from "react";
import { homeMonthOf, homeMonthRange, type MonthRange } from "@/components/home/month";
import { getReportMonths } from "@/lib/reports";

/**
 * The home screen's browsable months, read once per request: the dashboard
 * layout hands them to the shell (the command palette's months) and the home
 * page to its month navigation, so both always agree on the floor.
 */
export const getHomeMonthRange = cache(
  async (): Promise<MonthRange> => homeMonthRange(await getReportMonths(), homeMonthOf(new Date())),
);
