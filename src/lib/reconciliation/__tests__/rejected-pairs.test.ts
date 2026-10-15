import { describe, it, expect } from "vitest";
import {
  NO_REJECTIONS,
  isRejected,
  pairKey,
  pairsToRecordOnReject,
  toRejectedPairs,
} from "../rejected-pairs";

describe("rejected pairs", () => {
  it("treats a pair as unordered", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    const rejected = toRejectedPairs([["b", "a"]]);
    expect(isRejected(rejected, "a", "b")).toBe(true);
    expect(isRejected(rejected, "b", "a")).toBe(true);
  });

  it("does not reject a row's other pairings", () => {
    const rejected = toRejectedPairs([["a", "b"]]);
    expect(isRejected(rejected, "a", "c")).toBe(false);
    expect(isRejected(NO_REJECTIONS, "a", "b")).toBe(false);
  });

  it("records the lump against each detail of a settlement group", () => {
    const pairs = pairsToRecordOnReject([
      { id: "lump", reconciliationRole: "settlement_lump" },
      { id: "d1", reconciliationRole: "settlement_detail" },
      { id: "d2", reconciliationRole: "settlement_detail" },
    ]);
    expect(toRejectedPairs(pairs)).toEqual(
      toRejectedPairs([
        ["lump", "d1"],
        ["lump", "d2"],
      ]),
    );
  });

  it("records the two members of a transfer pair", () => {
    const pairs = pairsToRecordOnReject([
      { id: "x", reconciliationRole: "transfer_pair" },
      { id: "y", reconciliationRole: "transfer_pair" },
    ]);
    expect(toRejectedPairs(pairs)).toEqual(toRejectedPairs([["x", "y"]]));
  });

  it("records a suspected-transfer singleton against itself", () => {
    const pairs = pairsToRecordOnReject([{ id: "s", reconciliationRole: "transfer_pair" }]);
    expect(pairs).toEqual([["s", "s"]]);
    expect(isRejected(toRejectedPairs(pairs), "s", "s")).toBe(true);
  });
});
