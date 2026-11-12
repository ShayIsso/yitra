/**
 * The app's icon set: Phosphor glyphs carrying only the weights the design
 * system draws them in (ADR-0015 "Icons"). Import each icon by name: every
 * glyph is its own pure module, and this directory's package.json declares it
 * free of side effects, so a route ships only the icons it imports. Keep it
 * that way: a module here with a top-level side effect would be silently kept
 * on every route that imports any icon.
 */
export * from "./phosphor.generated";
export type { GlyphProps } from "./glyph";
