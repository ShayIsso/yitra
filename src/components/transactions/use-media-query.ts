"use client";

import * as React from "react";

/**
 * Whether a media query matches. The server snapshot is `false`; the page
 * only branches on it for rows, which load after hydration, so the first
 * client render never disagrees with the server's HTML.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
