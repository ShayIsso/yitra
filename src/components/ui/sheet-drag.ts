/** A drag of at least this far always dismisses, however slow (capped by the sheet's height). */
const DISMISS_DISTANCE_PX = 120;
/** Share of the sheet's height that dismisses a short sheet. */
const DISMISS_SHARE = 0.3;
/** A flick: a fast downward release dismisses once it has moved this far. */
const FLICK_MIN_PX = 24;
const FLICK_PX_PER_MS = 0.5;
/** How far back from the release the flick speed is read. */
const VELOCITY_WINDOW_MS = 80;

export type DragSample = { y: number; t: number };

/**
 * The finger's downward speed (px/ms) over the last moments before release,
 * not over the whole press: holding the handle and then flicking is a flick,
 * and a fast drag that stops before letting go is not.
 */
export function releaseVelocity(samples: readonly DragSample[], release: DragSample): number {
  const from = samples.find((s) => release.t - s.t <= VELOCITY_WINDOW_MS) ?? release;
  const dt = release.t - from.t;
  return dt > 0 ? (release.y - from.y) / dt : 0;
}

/**
 * Whether a downward drag of the sheet's handle closes the sheet or lets it
 * settle back. Far enough, or a flick (see `releaseVelocity`), closes it; an
 * upward or tiny drag never does.
 */
export function sheetDragOutcome(
  dy: number,
  velocity: number,
  sheetHeight: number,
): "dismiss" | "restore" {
  if (dy <= 0) return "restore";
  if (dy >= Math.min(DISMISS_DISTANCE_PX, sheetHeight * DISMISS_SHARE)) return "dismiss";
  return dy >= FLICK_MIN_PX && velocity >= FLICK_PX_PER_MS ? "dismiss" : "restore";
}
