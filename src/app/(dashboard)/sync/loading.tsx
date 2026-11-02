import { SyncPanelSkeleton } from "@/components/sync-panel";

/**
 * The post-sync `router.refresh()` (and the shell's pending badge with it)
 * commits under this boundary reliably only on Next >= 16.3 (#339).
 */
export default function SyncLoading() {
  return <SyncPanelSkeleton />;
}
