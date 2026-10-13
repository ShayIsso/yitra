import { db } from "@/db";
import { seedDefaultCategories } from "@/db/seed";
import { categories } from "@/db/schema";
import { buildTaxonomyView, type TaxonomyView } from "./taxonomy-view";

/**
 * Idempotent, so it is safe to call from every path that can finish setup
 * (the categories step and completion): nothing depends on the step having run.
 */
export async function ensureDefaultCategories(): Promise<void> {
  await seedDefaultCategories();
}

export async function readTaxonomyView(): Promise<TaxonomyView> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      color: categories.color,
      parentId: categories.parentId,
    })
    .from(categories);
  return buildTaxonomyView(rows);
}
