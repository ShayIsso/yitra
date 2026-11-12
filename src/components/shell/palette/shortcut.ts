export type ShortcutEvent = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "metaKey"
  | "ctrlKey"
  | "altKey"
  | "shiftKey"
  | "defaultPrevented"
  | "isComposing"
>;

/**
 * Whether a keydown is the palette's Cmd+K (Mac) / Ctrl+K (elsewhere).
 *
 * - On a Mac only Cmd counts: Ctrl+K in a macOS text field deletes to the end
 *   of the line, and the palette must not steal it.
 * - The letter decides on Latin layouts (Dvorak's K is not on the QWERTY K
 *   key). A non-Latin layout types another letter there (ל on Hebrew), so the
 *   physical K key counts then, or a Hebrew-layout user could never open it.
 * - A key the focused element already handled (a rich editor's "insert
 *   link"), or one pressed mid-IME-composition, is left alone.
 * - Browsers bind Ctrl+K / Cmd+K to the address-bar search, but let a page
 *   take it with preventDefault, which the caller does.
 */
export function isPaletteShortcut(event: ShortcutEvent, { mac }: { mac: boolean }): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.altKey || event.shiftKey) return false;
  const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier) return false;
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key === "k";
  return event.code === "KeyK";
}

/** Apple platforms take Cmd, everything else Ctrl. */
export function isApplePlatform(nav: Pick<Navigator, "platform" | "userAgent">): boolean {
  return /mac|iphone|ipad|ipod/i.test(nav.platform || nav.userAgent);
}
