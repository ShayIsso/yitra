import { DEFAULT_GROUPS, TAXONOMY_V2, type CategoryDef } from "@/db/taxonomy";

export type TaxonomyRow = {
  id: string;
  name: string;
  type: CategoryDef["type"];
  color: string;
  parentId: string | null;
};

export type TaxonomyEntry = Pick<TaxonomyRow, "name" | "type" | "color">;

export type TaxonomyView = {
  groups: (TaxonomyEntry & { children: TaxonomyEntry[] })[];
  standalone: TaxonomyEntry[];
};

const entry = ({ name, type, color }: TaxonomyRow): TaxonomyEntry => ({ name, type, color });

const SEED_ORDER = [...DEFAULT_GROUPS.map((g) => g.name), ...TAXONOMY_V2.map((c) => c.name)];

/** Rows come back in table order; the seed's own order reads better and is stable. */
const bySeedOrder = (a: TaxonomyRow, b: TaxonomyRow) => {
  const rank = (r: TaxonomyRow) => {
    const i = SEED_ORDER.indexOf(r.name);
    return i === -1 ? SEED_ORDER.length : i;
  };
  return rank(a) - rank(b);
};

/** A group is whatever has children (ADR-0011): the hierarchy is derived, never flagged. */
export function buildTaxonomyView(rows: readonly TaxonomyRow[]): TaxonomyView {
  const childrenOf = new Map<string, TaxonomyRow[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
  }

  const roots = rows.filter((r) => r.parentId === null).sort(bySeedOrder);
  return {
    groups: roots
      .filter((r) => childrenOf.has(r.id))
      .map((r) => ({ ...entry(r), children: childrenOf.get(r.id)!.sort(bySeedOrder).map(entry) })),
    standalone: roots.filter((r) => !childrenOf.has(r.id)).map(entry),
  };
}
