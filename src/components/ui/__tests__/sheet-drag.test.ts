import { describe, it, expect } from "vitest";
import { releaseVelocity, sheetDragOutcome, type DragSample } from "@/components/ui/sheet-drag";

const TALL = 600;

/** Where the finger was, then where it let go; the outcome as the handle decides it. */
function release(samples: DragSample[], up: DragSample, height = TALL) {
  const start = samples[0] ?? up;
  return sheetDragOutcome(up.y - start.y, releaseVelocity(samples, up), height);
}

describe("sheet drag", () => {
  it("closes a sheet dragged well down, however slowly", () => {
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 100, t: 1500 },
        ],
        { y: 130, t: 2000 },
      ),
    ).toBe("dismiss");
  });

  it("lets a short, slow drag settle back", () => {
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 50, t: 500 },
        ],
        { y: 60, t: 600 },
      ),
    ).toBe("restore");
  });

  it("closes on a quick flick", () => {
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 20, t: 30 },
        ],
        { y: 40, t: 60 },
      ),
    ).toBe("dismiss");
  });

  it("closes on a flick after holding the handle still", () => {
    const held = [
      { y: 0, t: 0 },
      { y: 2, t: 900 },
      { y: 30, t: 930 },
    ];
    expect(release(held, { y: 44, t: 945 })).toBe("dismiss");
  });

  it("does not count a fast drag that stopped before letting go as a flick", () => {
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 60, t: 40 },
        ],
        { y: 60, t: 400 },
      ),
    ).toBe("restore");
  });

  it("ignores a twitch, however fast", () => {
    expect(release([{ y: 0, t: 0 }], { y: 10, t: 5 })).toBe("restore");
  });

  it("never closes on an upward drag", () => {
    expect(release([{ y: 0, t: 0 }], { y: -200, t: 50 })).toBe("restore");
    expect(sheetDragOutcome(0, 5, TALL)).toBe("restore");
  });

  it("scales the distance to a short sheet", () => {
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 70, t: 1500 },
        ],
        { y: 70, t: 2000 },
        200,
      ),
    ).toBe("dismiss");
    expect(
      release(
        [
          { y: 0, t: 0 },
          { y: 50, t: 1500 },
        ],
        { y: 50, t: 2000 },
        200,
      ),
    ).toBe("restore");
  });
});
