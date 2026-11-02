"use client";

import { LazyMotion, MotionConfig } from "motion/react";

/**
 * The animation feature bundle is a separate chunk that LazyMotion fetches
 * from its mount effect, after hydration, so it stays off the first-load
 * critical path (ADR-0015 "Motion"). `m` elements render statically until it
 * arrives.
 */
const loadFeatures = () => import("./features").then((mod) => mod.default);

/**
 * Mounted once in the root layout. `strict` makes a full `motion.*` component
 * throw, because it would pull the whole animation runtime into the first-load
 * bundle; use `m.*` from `@/components/motion`. `reducedMotion="user"` is the
 * reduced-motion convention: under `prefers-reduced-motion`, transform and
 * layout animations are skipped and only opacity animates.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
