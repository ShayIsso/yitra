"use server";

import { requireSession } from "@/lib/auth";
import { ensureDefaultCategories, readTaxonomyView, type TaxonomyView } from "@/lib/onboarding";

export async function loadDefaultCategoriesAction(): Promise<TaxonomyView> {
  await requireSession("/setup");
  await ensureDefaultCategories();
  return readTaxonomyView();
}
