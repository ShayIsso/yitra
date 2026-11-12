export const dynamic = "force-dynamic";

import { HomeScreen } from "@/components/home/home-screen";
import { compareMonths, homeMonthOf } from "@/components/home/month";
import { isBankType } from "@/lib/bank-registry";
import { OUTLOOK_FIRST_YEAR } from "@/lib/budgets/outlook-range";
import { getCategories } from "@/lib/categories";
import { listCredentials } from "@/lib/credentials";
import { getReportMonths } from "@/lib/reports";

export default async function HomePage() {
  const [categories, credentials, monthsWithData] = await Promise.all([
    getCategories(),
    listCredentials(),
    getReportMonths(),
  ]);
  // A credential for a retired institution cannot sync, so it is not
  // "connected" (ADR-0013 §4); the month outlook counts the same way.
  const banks = credentials
    .filter((c) => isBankType(c.bankType))
    .map(({ id, bankType, displayName }) => ({ id, bankType, displayName }));
  const current = homeMonthOf(new Date());
  // Newest first; with no data yet, the outlook route's own floor. Rows the
  // bank lists ahead (installments) never put the floor past this month.
  const oldest = monthsWithData.at(-1);
  const first = !oldest
    ? { year: OUTLOOK_FIRST_YEAR, month: 1 }
    : compareMonths(oldest, current) > 0
      ? current
      : { year: oldest.year, month: oldest.month };
  return (
    <HomeScreen
      range={{ first, current }}
      categories={categories}
      banks={banks}
      hasTransactions={monthsWithData.length > 0}
    />
  );
}
