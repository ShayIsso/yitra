export const dynamic = "force-dynamic";

import { getPendingInboxRows } from "@/lib/reconciliation/inbox-store";
import { ReconciliationInbox } from "@/components/reconciliation-inbox";

/**
 * Deliberately no streaming skeleton (route `loading.tsx` or in-page
 * Suspense): with either, an approve's re-render raced the shell's Link
 * prefetches and left the pending-reconciliation badge stale in roughly one
 * run in eight on the production build, against none in 31 without (#324).
 */
export default async function ReconciliationPage() {
  const rows = await getPendingInboxRows();

  const groupMap = new Map<
    string,
    {
      groupId: string;
      confidence: number;
      members: typeof rows;
    }
  >();

  for (const row of rows) {
    const existing = groupMap.get(row.reconciliationGroupId);
    if (existing) {
      existing.members.push(row);
    } else {
      groupMap.set(row.reconciliationGroupId, {
        groupId: row.reconciliationGroupId,
        confidence: row.reconciliationConfidence,
        members: [row],
      });
    }
  }

  const groups = Array.from(groupMap.values());

  return <ReconciliationInbox groups={groups} />;
}
