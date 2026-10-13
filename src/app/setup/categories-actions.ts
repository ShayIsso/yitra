"use server";

import { requireSession } from "@/lib/auth";
import {
  ensureDefaultCategories,
  readSetupState,
  readTaxonomyView,
  type TaxonomyView,
} from "@/lib/onboarding";

export async function loadDefaultCategoriesAction(): Promise<TaxonomyView> {
  await requireSession("/setup");
  if (!(await readSetupState(true)).completed) await ensureDefaultCategories();
  return readTaxonomyView();
}
