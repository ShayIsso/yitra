import { ReconciliationInboxSkeleton } from "@/components/reconciliation-inbox";

/**
 * With this boundary in place, an approve/reject re-render of the route (and
 * the shell's pending badge with it) commits reliably only on Next >= 16.3
 * (#339).
 */
export default function ReconciliationLoading() {
  return <ReconciliationInboxSkeleton />;
}
