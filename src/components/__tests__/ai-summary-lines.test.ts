import { describe, it, expect } from "vitest";
import { aiSummaryLines } from "@/components/ai-summary-lines";

describe("aiSummaryLines", () => {
  it("renders one line per non-empty bucket, in applied/queued/skipped order", () => {
    expect(aiSummaryLines({ applied: 3, queued: 2, skipped: 1 })).toEqual([
      "3 עסקאות סווגו אוטומטית",
      "2 עסקאות ממתינות לבדיקה",
      "1 עסקאות נותרו ללא סיווג",
    ]);
  });

  it("omits empty buckets", () => {
    expect(aiSummaryLines({ applied: 0, queued: 4, skipped: 0 })).toEqual([
      "4 עסקאות ממתינות לבדיקה",
    ]);
  });

  it("is empty for an all-zero summary", () => {
    expect(aiSummaryLines({ applied: 0, queued: 0, skipped: 0 })).toEqual([]);
  });
});
