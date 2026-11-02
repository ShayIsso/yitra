import { ReconciliationInboxSkeleton } from "@/components/reconciliation-inbox";

/**
 * An approve/reject re-render of this route (and the shell's pending badge
 * with it) commits under this boundary reliably only on Next >= 16.3 (#339).
 */
export default function ReconciliationLoading() {
  return <ReconciliationInboxSkeleton />;
}
