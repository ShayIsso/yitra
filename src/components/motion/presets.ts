/**
 * Shared motion vocabulary (ADR-0015 "Motion"). The CSS animations in
 * globals.css (.enter, .fade-in, --ease-enter) use the same curve and timings,
 * so JS and CSS entrances read as one system.
 */
export const EASE_ENTER = [0.16, 1, 0.3, 1] as const;

/**
 * Once-only entrance: fade plus a short rise. Spread onto an `m.*` element;
 * under reduced motion the provider drops the rise and keeps the fade.
 */
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: EASE_ENTER },
} as const;
