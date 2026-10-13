import { db } from "./index";
import { categories } from "./schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TAXONOMY_V2, DEFAULT_GROUPS } from "./taxonomy";

export type SeedResult = {
  inserted: number;
  alreadyExisted: number;
  groupsInserted: number;
  linked: number;
};

/**
 * Serializes concurrent seeds (the wizard can fire it from several requests at
 * once). The unique name index would turn the race into a failed request, and
 * the by-name backfill needs to see the other run's rows, so runs queue here.
 */
const SEED_LOCK_KEY = 259_001;

/** Callable from application code: never exits the process, never loads its own environment. */
export async function seedDefaultCategories(): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);

    const existing = await tx
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.isDefault, true));
    const existingNames = new Set(existing.map((c) => c.name));

    let inserted = 0;
    for (const category of TAXONOMY_V2) {
      if (!existingNames.has(category.name)) {
        await tx.insert(categories).values({ ...category, isDefault: true });
        inserted++;
      }
    }

    // Default grouping (ADR-0011 §7): seed each expense group, then backfill its
    // children's parent_id by name. Idempotent and safe to re-run — a child is
    // only linked while it is still a root leaf, so a user who has since detached
    // or regrouped a leaf is never overridden.
    let groupsInserted = 0;
    let linked = 0;
    for (const group of DEFAULT_GROUPS) {
      let [row] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.name, group.name));

      if (!row) {
        [row] = await tx
          .insert(categories)
          .values({
            name: group.name,
            type: "expense",
            icon: group.icon,
            color: group.color,
            isDefault: true,
          })
          .returning({ id: categories.id });
        groupsInserted++;
      }

      for (const childName of group.children) {
        const result = await tx
          .update(categories)
          .set({ parentId: row.id })
          .where(and(eq(categories.name, childName), isNull(categories.parentId)))
          .returning({ id: categories.id });
        linked += result.length;
      }
    }

    return { inserted, alreadyExisted: existingNames.size, groupsInserted, linked };
  });
}
