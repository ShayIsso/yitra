import { AppShell } from "@/components/shell";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pendingReconCount = await getPendingGroupCount();
  return <AppShell pendingReconCount={pendingReconCount}>{children}</AppShell>;
}
