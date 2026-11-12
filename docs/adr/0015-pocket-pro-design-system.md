# 0015 — The Pocket Pro design system

**Status:** accepted (2026-11-02, #314; spec #312 "Design system"). Amended 2026-11-12 by the
redesign cleanup (#327): Lucide removed, one module per icon, the `motion` library dropped (CSS
only), the retired `--emerald`, `--warning` and `--sidebar-*` tokens removed.

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
  Text on a coral fill is ink (white on coral fails AA).
- **Money:** `--pos` / `--neg` are a dedicated green/red pair that passes AA on every surface in
  both themes. Colour is never the only signal for good/bad; a sign, word or icon carries it too. Verdicts
  that are not amounts (a budget's pace, a met or missed savings target) are words with a glyph,
  coral when they call for attention and neutral otherwise (`src/components/budget-verdict.tsx`).
- **Hero:** `--hero` is a dark teal surface in both themes; no coral glow behind text.
- **Category colours** appear as small dots only.
- **Contrast:** every text/surface pair is checked for WCAG AA (≥ 4.5:1) in both themes by
  `src/app/__tests__/palette-contrast.test.ts`, which reads `globals.css` directly. The checked
  pairs: foreground, muted-foreground, pos, neg, destructive and attention-text on background,
  card and muted; and card/popover/primary/secondary/accent/attention foregrounds on their fills, attention-text on attention-subtle, hero-foreground and hero-muted
  on hero. Translucent fills count too: text on a `bg-<token>/<alpha>` tint is checked
  alpha-composited over background, card and muted, for every alpha the components use (rest and
  hover): destructive text and foreground on destructive /10 and /20 (dark /10, /15, /20), and
  the hero and sand tints listed in the test. Meeting these
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
to large (Card and Dialog use `rounded-xl`), so no radius utility yields a fourth value. New code
never uses an arbitrary radius (the two that predated this ADR, on the checkbox and the retired
chart legend, are gone).

### Icons

Phosphor (MIT) replaces Lucide app-wide: regular weight for inactive and interface icons, fill for
active navigation and status, duotone for insight and category marks. Lucide is gone (#327).

Phosphor's per-icon modules each carry all six weights. Measured with
`scripts/perf/module-cost.ts`, the redesign's 51-icon set imported that way costs **33.2 kB gz**,
over three times the ~10 kB icon budget. So the app's icons come from `@/components/icons`,
generated by `scripts/icons/generate-phosphor.ts` from `@phosphor-icons/react@2.1.10`'s own icon
definitions, carrying only the weights listed in `scripts/icons/phosphor-manifest.ts` and rendered
through the package's context-free base. Each glyph is **its own pure module**
(`src/components/icons/generated/<Name>.ts`) behind a barrel, and the directory's `package.json`
declares it free of side effects, so Turbopack drops the barrel's unused re-exports and a route
ships only the glyphs it imports. Both halves are needed: with all glyphs in one module (as #314
shipped it) or without the `sideEffects` declaration, Turbopack put every glyph used by any route
into one chunk that every route loaded (65 glyphs, 10.0 kB gz, on every route). Measured on the
production build after the split (#327): home 58 glyphs, 10.9 kB gz (all 31 category marks
included, since an insight card can draw any of them); transactions 4.3, reports 4.2,
reconciliation 3.2, subscriptions 3.6, sync 4.0, settings 10.7 (its icon picker), login 0.4. The
budget applies per route; home and settings exceed it by 0.9 and 0.7 kB, the price of drawing
any stored category mark (flagged in #327; home's first-load JS stays far under its ceiling).
The whole 79-glyph set is 13.0 kB gz and no route loads it. Icons are
decorative (`aria-hidden`) unless given `alt`. Adding an icon means editing the manifest,
regenerating, and re-measuring the routes that import it.

`categories.icon` stores a name. Rows from before the redesign hold Lucide names (the seeded
taxonomy and the old picker) and are never rewritten; the picker now offers Phosphor names.
`src/components/category-icon.tsx` draws both spellings, with a neutral mark for any other name.

### Motion

CSS only: the utilities in `globals.css` (`.enter`, `.stagger`, `.page-enter`, `.press`,
`.hover-tint`, on the shared `--ease-enter` curve) and tw-animate-css for the dialog and select
popups. #314 adopted the `motion` library (LazyMotion in the root layout, about 11 kB gz eager on
every route plus a 19 kB lazy feature chunk), but no surface of the redesign used it, so #327
removed it. Reintroducing a JS animation library needs an amendment here and a measured
first-load delta. Under `prefers-reduced-motion`, CSS animations keep opacity only (the media
query in `globals.css`; the dialog zeroes tw-animate's translate and scale). Rules: transform and
opacity only; short, once-only entrances; no count-up on money; no infinite animation except the
skeleton pulse (a busy button says so in words, not with a spinner); no per-row animation in
tables; no backdrop blur over large scrolling regions; no WebGL or canvas effects.

### Performance

The redesign may add at most +40 kB gz to the home route's modern-browser first-load JS
(`noModule` polyfills excluded) over the baseline in `docs/perf-baseline.md` (278.7 kB gz; icons
included), may not make first meaningful content slower on a 6× CPU / Slow 4G profile,
and may not introduce layout shift (CLS stays at the baseline's 0.000). Every redesign PR records its numbers against that baseline.

## Consequences

- Components use semantic tokens (`bg-background`, `text-muted-foreground`, `text-pos`,
  `bg-attention`, …), never raw palette values; no raw Tailwind hue remains in `src/`.
- A palette change must keep `palette-contrast.test.ts` green; a new text/surface pairing is
  added to that test.
- The Yitra mark keeps its identity violet (`--brand`, `brand/brand.md`) for now; whether the
  mark follows the teal/coral palette is a separate brand decision.
- New runtime dependencies beyond `@phosphor-icons/react` need a recorded
  justification.
