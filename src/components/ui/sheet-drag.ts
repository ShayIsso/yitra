/** A drag of at least this far always dismisses, however slow (capped by the sheet's height). */
const DISMISS_DISTANCE_PX = 120;
/** Share of the sheet's height that dismisses a short sheet. */
const DISMISS_SHARE = 0.3;
/** A flick: a fast downward release dismisses once it has moved this far. */
const FLICK_MIN_PX = 24;
const FLICK_PX_PER_MS = 0.5;

/**
 * Whether a downward drag of the sheet's handle, released after `ms`, closes
 * the sheet or lets it settle back. Far enough or fast enough closes it; an
 * upward or tiny drag never does.
 */
export function sheetDragOutcome(
  dy: number,
  ms: number,
  sheetHeight: number,
): "dismiss" | "restore" {
  if (dy <= 0) return "restore";
  if (dy >= Math.min(DISMISS_DISTANCE_PX, sheetHeight * DISMISS_SHARE)) return "dismiss";
  return dy >= FLICK_MIN_PX && dy / Math.max(ms, 1) >= FLICK_PX_PER_MS ? "dismiss" : "restore";
}
