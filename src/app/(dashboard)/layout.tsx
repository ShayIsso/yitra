import { AppShell } from "@/components/shell";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";
import { getHomeMonthRange } from "./home-month-range";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [pendingReconCount, monthRange] = await Promise.all([
    getPendingGroupCount(),
    getHomeMonthRange(),
  ]);
  return (
    <AppShell pendingReconCount={pendingReconCount} monthRange={monthRange}>
      {children}
    </AppShell>
  );
}
