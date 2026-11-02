import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { glyph } from "@/components/icons/glyph";

const Dot = glyph("Dot", {
  fill: [["circle", { cx: "128", cy: "128", r: "96" }]],
  duotone: [
    ["circle", { cx: "128", cy: "128", r: "96", opacity: "0.2" }],
    ["path", { d: "M0,0Z" }],
  ],
});

const render = (props: Parameters<typeof Dot>[0] = {}) =>
  renderToStaticMarkup(createElement(Dot, props));

describe("glyph", () => {
  it("draws its first declared weight when none is given", () => {
    expect(render()).toContain('<circle cx="128" cy="128" r="96">');
    expect(render()).not.toContain("opacity");
  });

  it("draws the requested weight", () => {
    const svg = render({ weight: "duotone" });
    expect(svg).toContain('opacity="0.2"');
    expect(svg).toContain('d="M0,0Z"');
  });

  it("is hidden from assistive tech unless given alt text", () => {
    expect(render()).toContain('aria-hidden="true"');
    const labelled = render({ alt: "סגירה" });
    expect(labelled).not.toContain("aria-hidden");
    expect(labelled).toContain("<title>סגירה</title>");
  });

  it("sizes to the surrounding text by default and follows currentColor", () => {
    const svg = render();
    expect(svg).toContain('width="1em"');
    expect(svg).toContain('fill="currentColor"');
  });

  it("names itself for devtools", () => {
    expect(Dot.displayName).toBe("DotIcon");
  });
});
