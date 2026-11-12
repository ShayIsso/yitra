import { describe, it, expect } from "vitest";
import { sheetDragOutcome } from "@/components/ui/sheet-drag";

const TALL = 600;

describe("sheetDragOutcome", () => {
  it("closes a sheet dragged well down, however slowly", () => {
    expect(sheetDragOutcome(130, 2000, TALL)).toBe("dismiss");
  });

  it("lets a short, slow drag settle back", () => {
    expect(sheetDragOutcome(60, 600, TALL)).toBe("restore");
  });

  it("closes on a quick flick", () => {
    expect(sheetDragOutcome(40, 60, TALL)).toBe("dismiss");
  });

  it("ignores a twitch, however fast", () => {
    expect(sheetDragOutcome(10, 5, TALL)).toBe("restore");
  });

  it("never closes on an upward drag", () => {
    expect(sheetDragOutcome(-200, 50, TALL)).toBe("restore");
    expect(sheetDragOutcome(0, 50, TALL)).toBe("restore");
  });

  it("scales the distance to a short sheet", () => {
    expect(sheetDragOutcome(70, 2000, 200)).toBe("dismiss");
    expect(sheetDragOutcome(50, 2000, 200)).toBe("restore");
  });
});
