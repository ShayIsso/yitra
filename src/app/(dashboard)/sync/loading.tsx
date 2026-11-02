import { SyncPanelSkeleton } from "@/components/sync-panel";

/**
 * With this boundary in place, the post-sync `router.refresh()` (and the
 * shell's pending badge with it) commits reliably only on Next >= 16.3 (#339).
 */
export default function SyncLoading() {
  return <SyncPanelSkeleton />;
}
