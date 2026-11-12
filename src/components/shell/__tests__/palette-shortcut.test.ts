import { describe, it, expect } from "vitest";
import { isPaletteShortcut, type ShortcutEvent } from "../palette/shortcut";

const press = (over: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: "k",
  code: "KeyK",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isComposing: false,
  ...over,
});

describe("isPaletteShortcut on a Mac", () => {
  const mac = (over: Partial<ShortcutEvent>) => isPaletteShortcut(press(over), { mac: true });

  it("opens on Cmd+K", () => {
    expect(mac({ metaKey: true })).toBe(true);
    expect(mac({ metaKey: true, key: "K" })).toBe(true);
  });

  it("leaves Ctrl+K to the text field, where it deletes to the end of the line", () => {
    expect(mac({ ctrlKey: true })).toBe(false);
  });

  it("opens from a Hebrew keyboard layout, where the K key types ל", () => {
    expect(mac({ metaKey: true, key: "ל" })).toBe(true);
  });

  it("follows the letter, not the key position, on other Latin layouts", () => {
    // Dvorak: the physical K position types "t"; the letter K sits elsewhere.
    expect(mac({ metaKey: true, key: "t", code: "KeyK" })).toBe(false);
    expect(mac({ metaKey: true, key: "k", code: "KeyV" })).toBe(true);
  });
});

describe("isPaletteShortcut elsewhere", () => {
  const pc = (over: Partial<ShortcutEvent>) => isPaletteShortcut(press(over), { mac: false });

  it("opens on Ctrl+K", () => {
    expect(pc({ ctrlKey: true })).toBe(true);
  });

  it("ignores the Windows/Meta key", () => {
    expect(pc({ metaKey: true })).toBe(false);
  });
});

describe("isPaletteShortcut, whatever the platform", () => {
  const any = (over: Partial<ShortcutEvent>) =>
    isPaletteShortcut(press({ ctrlKey: true, ...over }), { mac: false });

  it("ignores K without the modifier", () => {
    expect(isPaletteShortcut(press({}), { mac: false })).toBe(false);
  });

  it("ignores other modifier combinations, which browsers and the OS own", () => {
    expect(any({ shiftKey: true })).toBe(false);
    expect(any({ altKey: true })).toBe(false);
    expect(any({ metaKey: true })).toBe(false);
  });

  it("leaves a key the focused element already handled alone", () => {
    expect(any({ defaultPrevented: true })).toBe(false);
  });

  it("ignores keys pressed while an input method is composing", () => {
    expect(any({ isComposing: true })).toBe(false);
  });

  it("ignores other keys", () => {
    expect(any({ key: "j", code: "KeyJ" })).toBe(false);
  });
});
