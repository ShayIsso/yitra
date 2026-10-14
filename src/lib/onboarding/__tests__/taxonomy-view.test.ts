import { describe, it, expect } from "vitest";
import { buildTaxonomyView, type TaxonomyRow } from "../taxonomy-view";

const row = (id: string, name: string, parentId: string | null = null): TaxonomyRow => ({
  id,
  name,
  type: "expense",
  color: "#000000",
  parentId,
});

describe("buildTaxonomyView", () => {
  it("nests leaves under the group that parents them", () => {
    const view = buildTaxonomyView([row("g", "group"), row("a", "a", "g"), row("b", "b", "g")]);

    expect(view.groups.map((g) => [g.name, g.children.map((c) => c.name)])).toEqual([
      ["group", ["a", "b"]],
    ]);
    expect(view.standalone).toEqual([]);
  });

  it("lists root categories without children as standalone, not as groups", () => {
    const view = buildTaxonomyView([row("g", "group"), row("a", "a", "g"), row("solo", "solo")]);

    expect(view.groups).toHaveLength(1);
    expect(view.standalone.map((c) => c.name)).toEqual(["solo"]);
  });

  it("is empty for an empty table", () => {
    expect(buildTaxonomyView([])).toEqual({ groups: [], standalone: [] });
  });
});
