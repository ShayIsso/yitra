import type { Cadence } from "@/lib/recurring-detection";

/** A recurring series' cadence in words, wherever a series is shown. */
export const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};
