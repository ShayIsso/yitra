# 0015 — The Pocket Pro design system

**Status:** accepted (2026-11-02, #314; spec #312 "Design system")

**Supersedes:** the UI/Design rules in `CLAUDE.md` as they stood before #314 ("light theme only",
"neutral whites/grays", "emerald/green accent for positive balances only", "Lucide icons",
"Assistant" typography) and the Phase 2 visual direction in `docs/PRD-phase2.md`.

## Context

The Phase 2/3 look (true-neutral zinc, emerald for positive money, Lucide, Assistant) produced an
app that reads like any generated admin dashboard. The redesign spec (#312) adopts the direction
validated by prototype variant E ("Pocket Pro") after an independent UX audit. This ADR records
that system so every redesign slice builds on one set of tokens, and it corrects a stale rule:
`CLAUDE.md` said "light theme only", but a pre-paint `data-theme` dark mode has shipped since #109.

## Decision

### Palette

Deep teal ink on warm paper, both themes first-class (`:root` and `[data-theme="dark"]` in
`src/app/globals.css`, same token names).

- **Surfaces:** paper (`--background`), warm white (`--card`, `--popover`), sand (`--muted`,
  `--secondary`, `--accent`). Ink (`--foreground`) is a near-black teal; `--primary` is a deep
  teal with paper text.
- **Coral means attention only** (`--attention`, `--attention-subtle`, `--attention-text`):
  badges, stale or failed sync, at-risk and over-target states. Never decoration, never "good".
  Text on a coral fill is ink (white on coral fails AA). `--warning` is the same coral pair under
  its older name.
- **Money:** `--pos` / `--neg` are a dedicated green/red pair that passes AA on every surface in
  both themes. Colour is never the only signal for good/bad; a sign, word or icon carries it too.
  `--emerald` survives only as an alias of `--pos` until the cleanup ticket removes its last uses.
- **Hero:** `--hero` is a dark teal surface in both themes; no coral glow behind text.
- **Category colours** appear as small dots only.
- **Contrast:** every text/surface pair is checked for WCAG AA (≥ 4.5:1) in both themes by
  `src/app/__tests__/palette-contrast.test.ts`, which reads `globals.css` directly. The checked
  pairs: foreground, muted-foreground, pos, neg, destructive and attention-text on background,
  card and muted; and card/popover/primary/secondary/accent/attention/warning/emerald/sidebar
  foregrounds on their fills, attention-text on attention-subtle, hero-foreground and hero-muted
  on hero. Translucent fills count too: text on a `bg-<token>/<alpha>` tint is checked
  alpha-composited over background, card and muted, for every alpha the components use (rest and
  hover): destructive text and foreground on destructive /10 and /20 (dark /10, /15, /20),
  emerald text and foreground on emerald /10 and /15, foreground on warning /15. Meeting these
  is why the money pair is darker in light (`--neg` crimson, `--pos` deep green) and the dark
  destructive button's tint is /15 at rest and /20 on hover. `--neg` is crimson rather than
  orange-red so negative money never reads as coral attention. A new tint or alpha is added to
  the test with the component that introduces it. Palette values stay `#rrggbb` so the test can
  compute them.
- **Dark variant:** `dark:` utilities follow the app's `data-theme`, not the OS preference
  (`@custom-variant dark` in `globals.css`).

### Typography

Rubik (Hebrew + Latin) through `next/font/google`, subset to `latin` and `hebrew`, variable
weight, `display: swap` with next/font's size-adjusted fallback so the swap does not shift layout
(measured: home CLS 0.000 under 6× CPU / Slow 4G, `docs/perf-baseline.md`).
Six steps, as Tailwind utilities: `text-caption` (12), `text-body` (14), `text-lead` (16),
`text-title` (20), `text-headline` (28), `text-display` (56–72, heavy, tight). **`text-display` is
reserved for the single hero figure on a surface.** Digits are tabular wherever amounts align:
`<Amount>` always, table cells by default, `.tabular-nums` elsewhere. `<Amount>` is extended (not
replaced) with `size` (a scale step) and `figure` (heavy numerals with a de-emphasised currency
symbol). The custom steps are registered with tailwind-merge in `cn`, or it would read
`text-title` as a colour and drop it.

### Shape

Exactly three radius tokens: `--radius-small` (controls: inputs, buttons, chips, rows),
`--radius-large` (cards, sheets, dialogs, the hero) and `--radius-full` (pills, avatars, dots;
Tailwind's `rounded-full`). Tailwind's `rounded`, `rounded-xs`…`lg` resolve to small (shadcn's
control radius is `rounded-lg`: buttons, inputs, selects share one shape) and `rounded-xl`…`4xl`
to large (Card and Dialog use `rounded-xl`), so no radius utility yields a fourth value. Two arbitrary radii
predate this ADR in shadcn primitives (`rounded-[4px]` on the checkbox, `rounded-[2px]` on chart
legend swatches); the page slices replace them, and new code never uses an arbitrary radius.

### Icons

Phosphor (MIT) replaces Lucide app-wide: regular weight for inactive and interface icons, fill for
active navigation and status, duotone for insight and category marks. This slice is the _expand_
step: Phosphor lands beside Lucide; the cleanup ticket removes Lucide.

Phosphor's per-icon modules each carry all six weights. Measured with
`scripts/perf/module-cost.ts`, the redesign's 51-icon set imported that way costs **33.2 kB gz**,
over three times the ~10 kB icon budget. So the app's icons come from `@/components/icons`, a
module generated by `scripts/icons/generate-phosphor.ts` from `@phosphor-icons/react@2.1.10`'s own
icon definitions, carrying only the weights listed in `scripts/icons/phosphor-manifest.ts` and
rendered through the package's context-free base. Each icon is a separate pure export, so a route
ships only the icons it imports: the whole 51-icon set is **8.6 kB gz**; in the production build
one icon adds 0.6 kB gz to the home route and the unused glyphs' path data is absent from every
chunk (Turbopack tree-shakes them). Icons
are decorative (`aria-hidden`) unless given `alt`. Adding an icon means editing the manifest,
regenerating, and re-measuring the set against the budget.

### Motion

One animation library, `motion` (14.6.0, pinned; published more than seven days before
adoption), only through `@/components/motion`: `LazyMotion` mounted once in the root layout with
the `domAnimation` feature bundle loaded by dynamic import after hydration, `m.*` elements, and
`strict` so a full `motion.*` component (which would pull the whole runtime into first load)
throws. Measured in the production build: the eager part (LazyMotion, MotionConfig and the shared
motion-dom core Turbopack keeps with them) adds about 11 kB gz to every route's first-load JS; the
feature chunk (about 19 kB gz) loads after hydration. `MotionConfig
reducedMotion="user"` is the shared reduced-motion convention: under `prefers-reduced-motion`,
transform and layout animations are skipped and only opacity animates. CSS animations follow the
same rule (`globals.css` keeps opacity only under the media query) and share the `--ease-enter`
curve with the `enter` preset. Rules: transform and opacity only; short, once-only entrances; no
count-up on money; no infinite animation except the skeleton pulse; no per-row motion components
in tables; no backdrop blur over large scrolling regions; no WebGL or canvas effects.

### Performance

The redesign may add at most +40 kB gz to the home route's modern-browser first-load JS
(`noModule` polyfills excluded) over the baseline in `docs/perf-baseline.md` (278.7 kB gz; icons
and motion included), may not make first meaningful content slower on a 6× CPU / Slow 4G profile,
and may not introduce layout shift (CLS stays at the baseline's 0.000). Every redesign PR records its numbers against that baseline.

## Consequences

- Components use semantic tokens (`bg-background`, `text-muted-foreground`, `text-pos`,
  `bg-attention`, …), never raw palette values. Raw Tailwind hues still present in older
  components (`text-red-600`, `bg-emerald-50`, `bg-amber-50`, …) are migrated by the page slices
  and the cleanup ticket.
- A palette change must keep `palette-contrast.test.ts` green; a new text/surface pairing is
  added to that test.
- The Yitra mark keeps its identity violet (`--brand`, `brand/brand.md`) for now; whether the
  mark follows the teal/coral palette is a separate brand decision.
- New runtime dependencies beyond `motion` and `@phosphor-icons/react` need a recorded
  justification.
