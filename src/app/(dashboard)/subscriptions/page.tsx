export const dynamic = "force-dynamic";

import {
  detectPriceChanges,
  detectMissedPayments,
  detectNewlyDetected,
  detectDormant,
  drizzleRecurringStore,
  projectSeries,
} from "@/lib/recurring-detection";
import { getAssignableCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";
import { SubscriptionsHeader } from "./header";
import { SubscriptionsLoadError } from "./load-error";
import { toSubscriptionRow, type AnomalyAlerts, type SubscriptionRow } from "./rows";
import { SubscriptionsView } from "./subscriptions-view";

async function loadSubscriptions(): Promise<{
  subscriptions: SubscriptionRow[];
  alerts: AnomalyAlerts;
}> {
  // One transaction read feeds every detector and the projection: the same
  // liveness evidence the upcoming forecast uses, so the two pages agree.
  const [patterns, recentTxns] = await Promise.all([
    drizzleRecurringStore.getPersistedPatterns(),
    drizzleRecurringStore.getTransactionsForDetection(),
  ]);

  // Pass today once so the pure detectors and the row view agree on "now".
  const today = new Date();
  const projections = projectSeries(patterns, recentTxns, today);
  const subscriptions = patterns.map((pattern, i) =>
    toSubscriptionRow(pattern, projections[i], today),
  );

  return {
    subscriptions,
    alerts: {
      priceChanges: detectPriceChanges(patterns, recentTxns),
      missedPayments: detectMissedPayments(patterns, recentTxns, today),
      newlyDetected: detectNewlyDetected(patterns, recentTxns),
      dormant: detectDormant(patterns, recentTxns, today),
    },
  };
}

export default async function SubscriptionsPage() {
  let data: Awaited<ReturnType<typeof loadSubscriptions>>;
  try {
    data = await loadSubscriptions();
  } catch {
    // Nothing is logged: a driver error can carry query parameters, i.e. bank data.
    return (
      <div className="space-y-6">
        <SubscriptionsHeader />
        <SubscriptionsLoadError />
      </div>
    );
  }

  // For the naming dialog's optional category field: assignable (leaf) only
  // (ADR-0011 §3), a group is never a valid assignment. Optional, so a failed
  // read only hides the field.
  const categories: Category[] = await getAssignableCategories().catch(() => []);

  return (
    <div className="space-y-6">
      <SubscriptionsHeader />
      <SubscriptionsView
        subscriptions={data.subscriptions}
        alerts={data.alerts}
        categories={categories}
      />
    </div>
  );
}
