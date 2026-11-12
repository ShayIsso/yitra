"use client";

import * as React from "react";
import type { MonthRange } from "@/components/home/month";
import { isApplePlatform, isPaletteShortcut } from "./shortcut";

/** Boxed: a component is callable, so as bare state React would read it as an updater. */
type LoadedPalette = {
  Palette: React.LazyExoticComponent<typeof import("./command-palette").default>;
};

// React.lazy, not next/dynamic: a lazy component keeps a failed import as its
// result, so a retry after a ChunkLoadError needs a fresh one, which a
// module-level next/dynamic can't give. A retry helps a dropped connection;
// a stale hashed chunk after an upgrade keeps failing until a reload, but the
// boundary below keeps it from taking the shell down.
const loadPalette = (): LoadedPalette => ({
  Palette: React.lazy(() => import("./command-palette")),
});

/**
 * Catches a palette that failed to load or render so it can't take the shell
 * down with it; it renders nothing and tells the launcher to start over.
 */
class PaletteBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Opens the command palette on Cmd+K (Mac) / Ctrl+K (elsewhere) from anywhere
 * in the shell, and closes it on the same keys. Only this listener rides in
 * every route's first load (#326); the palette's UI and search are fetched on
 * the first press, and again on the next press if that fetch failed.
 */
export function PaletteLauncher({ monthRange }: { monthRange: MonthRange }) {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState<LoadedPalette | null>(null);

  React.useEffect(() => {
    const mac = isApplePlatform(navigator);
    function onKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event, { mac })) return;
      // A rich editor owns Cmd+K ("insert link"), and another open dialog owns the keyboard.
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
      if (
        document.querySelector('[role="dialog"]:not([data-command-palette]), [role="alertdialog"]')
      ) {
        return;
      }
      event.preventDefault();
      setLoaded((current) => current ?? loadPalette());
      setOpen((wasOpen) => !wasOpen);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const reset = React.useCallback(() => {
    setOpen(false);
    setLoaded(null);
  }, []);

  if (!loaded) return null;
  const { Palette } = loaded;
  return (
    <PaletteBoundary onError={reset}>
      <React.Suspense fallback={null}>
        <Palette open={open} onOpenChange={setOpen} range={monthRange} />
      </React.Suspense>
    </PaletteBoundary>
  );
}
