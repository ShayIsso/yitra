import { categorize, type CategoryRule } from "@/lib/categories/rules";
import { deriveMerchantKey, lookupMemory, type MerchantMemoryStore } from "@/lib/merchant-memory";
import type { Categorization } from "./import";

/**
 * Precedence at the import seam: rules (deliberately-authored law) → merchant
 * memory (learned exact-key mappings). AI runs later, after reconciliation
 * (ADR-0010 §1). Rules are fetched once per sync by the caller.
 */
export function createImportCategorizer(
  rules: CategoryRule[],
  memoryStore: MerchantMemoryStore,
): (description: string) => Promise<Categorization> {
  return async (description) => {
    const ruleCategoryId = categorize(description, rules);
    if (ruleCategoryId) return { categoryId: ruleCategoryId, source: "rule" };

    const key = deriveMerchantKey(description);
    if (!key) return { categoryId: null, source: null };
    const hit = (await lookupMemory([key], memoryStore)).get(key);
    if (!hit) return { categoryId: null, source: null };
    // Trust tier, not mechanism (ADR-0010 §2): a user-tier hit is `memory`, an
    // ai-tier hit stays `ai` so a cached guess never launders into trusted.
    return { categoryId: hit.categoryId, source: hit.source === "user" ? "memory" : "ai" };
  };
}
