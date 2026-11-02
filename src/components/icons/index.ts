/**
 * The app's icon set: Phosphor glyphs carrying only the weights the design
 * system draws them in (ADR-0015 "Icons"). Import each icon by name: every
 * export is a separate pure constant, so a route ships only what it imports.
 * Lucide stays beside this set until the redesign's cleanup removes it.
 */
export * from "./phosphor.generated";
export type { GlyphProps } from "./glyph";
