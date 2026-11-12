"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { isApplePlatform, isPaletteShortcut } from "./shortcut";

// The palette's UI and search ship in their own chunk, fetched on the first
// Cmd/Ctrl+K; only this listener rides in every route's first load (#326).
const CommandPalette = dynamic(() => import("./command-palette"), { ssr: false });

/**
 * Opens the command palette on Cmd+K (Mac) / Ctrl+K (elsewhere) from anywhere
 * in the shell, and closes it on the same keys.
 */
export function PaletteLauncher() {
  const [open, setOpen] = React.useState(false);
  const [requested, setRequested] = React.useState(false);

  React.useEffect(() => {
    const mac = isApplePlatform(navigator);
    function onKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event, { mac })) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // A rich editor owns Cmd+K ("insert link"), and another dialog owns the keyboard while open.
      if (target?.isContentEditable) return;
      if (target?.closest('[role="dialog"]:not([data-command-palette]), [role="alertdialog"]')) {
        return;
      }
      event.preventDefault();
      setRequested(true);
      setOpen((wasOpen) => !wasOpen);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return requested ? <CommandPalette open={open} onOpenChange={setOpen} /> : null;
}
