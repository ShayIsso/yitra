import { homeMonthOf, homeMonthRange } from "@/components/home/month";
import { AppShell } from "@/components/shell";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";
import { getHomeMonthRange } from "./home-month-range";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [pendingReconCount, monthRange] = await Promise.all([
    getPendingGroupCount(),
    // Only the palette's months depend on it here: a failed read must not take
    // down every page, so the shell falls back to the no-data range.
    getHomeMonthRange().catch(() => homeMonthRange([], homeMonthOf(new Date()))),
  ]);
  return (
    <AppShell pendingReconCount={pendingReconCount} monthRange={monthRange}>
      {children}
    </AppShell>
  );
}
