/**
 * The app's one animation entry point (ADR-0015 "Motion"). Animate with `m.*`
 * elements, never `motion.*` (the provider runs in strict mode). Rules:
 * transform and opacity only, entrances run once, no count-up on money, no
 * infinite animation except the skeleton pulse, and no per-row motion
 * components in tables.
 */
export * as m from "motion/react-m";
export { useReducedMotion } from "motion/react";
export { MotionProvider } from "./provider";
export { DURATION, EASE_ENTER, enter } from "./presets";
