export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { getCategories, getCategoryTree } from "@/lib/categories";
import { isProviderConfigured } from "@/lib/ai-categorization";
import { TransactionsPage as TransactionsView } from "@/components/transactions/transactions-page";

/**
 * The view (filters, search, page) is read from the URL by the client
 * component (`@/lib/transactions/view-params`), so deep links such as
 * `?uncategorized=true` or `?categoryId=…&month=2026-10` open filtered.
 */
export default async function TransactionsPage() {
  const [categories, tree, categorizationAvailable] = await Promise.all([
    getCategories(),
    getCategoryTree(),
    isProviderConfigured(),
  ]);
  return (
    <Suspense>
      <TransactionsView
        categories={categories}
        tree={tree}
        categorizationAvailable={categorizationAvailable}
      />
    </Suspense>
  );
}
