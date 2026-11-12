import { createElement, forwardRef, Fragment, type ReactElement } from "react";
import SSRBase from "@phosphor-icons/react/dist/lib/SSRBase";
import type { IconProps, IconWeight } from "@phosphor-icons/react/dist/lib/types";

export type Shape = readonly [tag: string, attrs: Readonly<Record<string, string>>];

/** Icon props narrowed to the weights this glyph actually carries. */
export type GlyphProps<W extends IconWeight> = Omit<IconProps, "weight" | "ref"> & {
  weight?: W;
};

/**
 * Builds one Phosphor icon from just the weights it is drawn in, rendered
 * through the package's context-free base so it works in server and client
 * components alike. Only the generated per-glyph modules (generated/<Name>.ts)
 * call this, each at its top level as a pure call: keep it free of side
 * effects, or every glyph would be kept on every route (see ../package.json).
 */
export function glyph<W extends IconWeight>(name: string, shapes: Record<W, readonly Shape[]>) {
  const declared = Object.keys(shapes) as W[];
  const weights = new Map<IconWeight, ReactElement>(
    declared.map((w) => [
      w,
      createElement(
        Fragment,
        null,
        ...shapes[w].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs })),
      ),
    ]),
  );

  const Glyph = forwardRef<SVGSVGElement, GlyphProps<W>>(function Glyph(
    { weight = declared[0], alt, ...props },
    ref,
  ) {
    return createElement(SSRBase, {
      ref,
      "aria-hidden": alt ? undefined : true,
      ...props,
      alt,
      weight,
      weights,
    });
  });
  Glyph.displayName = `${name}Icon`;
  return Glyph;
}
