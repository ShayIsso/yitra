"use client";

import * as React from "react";

export type MeasuredSize = { width: number; height: number };

/**
 * The live pixel size of an element, for SVG charts whose coordinate space
 * must be 1:1 with rendered pixels (#170: a constant viewBox letterboxes on
 * wide screens, and preserveAspectRatio="none" stretches strokes). Zero until
 * mounted. The first reading is taken in a layout effect, before paint, so a
 * chart never flashes empty inside its reserved box.
 */
export function useMeasuredSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState<MeasuredSize>({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (width: number, height: number) =>
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    const rect = el.getBoundingClientRect();
    read(rect.width, rect.height);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) read(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
