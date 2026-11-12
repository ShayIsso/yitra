# Performance baseline (pre-redesign)

The whole-app redesign (#312) has a hard performance budget: the home route may
not get slower to show its first meaningful content on a slow phone, and its
first-load JS may grow by **at most +40 kB gzipped in total** across every
redesign PR, icons included (icons alone ≤ ~10 kB gz). This file records the
numbers every redesign PR compares against, and the exact method to reproduce
them.

**The budgeted reference is the modern-browser first-load figure, 278.7 kB gz**
(see the addendum below). The 317.3 kB in the original table also counts
Next's `noModule` polyfill chunk, which modern browsers never fetch.

## Baseline numbers (original measurement)

Measured on `main` at **`a8a5f8d`** (before any redesign change), 2026-11-02.

| Metric                                                       | Baseline                               |
| ------------------------------------------------------------ | -------------------------------------- |
| Home (`/`) first-load JS, gzip -9                            | **317.3 kB** (1099.0 kB raw, 18 files) |
| FCP, median of 7, CPU 6x + Slow 4G                           | **2180 ms**                            |
| LCP, median of 7, CPU 6x + Slow 4G                           | **6400 ms** (LCP element: `<p>`)       |
| JS transferred during that load (server-encoded, incl. lazy) | 286.0 kB                               |
| lucide-react, all 96 icons imported under `src/`             | 8.8 kB gz (27.2 kB min)                |

Individual runs (ms, FCP / LCP): 2180/6628, 2348/6800, 2144/6628, 2128/6060,
2448/6400, 2152/6120, 2304/6256.

Environment: Apple M2 (8 cores), Node 24.22, Chrome for Testing 148 headless,
`next start` on the production build, synthetic seed below. The machine was
under load from other builds while measuring (load average ~6), so treat the
timings as this machine's reference, not as absolute numbers.

**What is deterministic and what is not.** First-load JS and library cost
depend only on the build: re-measuring the same commit gives the same bytes,
so the +40 kB budget is checked against the numbers above. FCP/LCP depend on
the machine and its load. To compare timings, run the probe on `origin/main`
and on your branch **back to back on the same machine**, and report both
medians alongside the baseline above.

### Addendum, 2026-11-02 (second measurement, #314 review)

Review of #314 found two gaps in the original method, so the probe was
extended and `a8a5f8d` re-measured (same machine and session, load average
~4, freshly seeded throwaway database). The original numbers above are left
as recorded.

| Metric (home `/`, `a8a5f8d`)                           | Value                                 |
| ------------------------------------------------------ | ------------------------------------- |
| **First-load JS, modern browsers (budgeted)**, gzip -9 | **278.7 kB** (989.0 kB raw, 17 files) |
| First-load JS including the `noModule` polyfill chunk  | 317.3 kB (unchanged; 1 noModule file) |
| **CLS**, median of 7, CPU 6x + Slow 4G                 | **0.000** (every run 0.000)           |
| FCP / LCP in the same runs                             | 2120 ms / 6060 ms                     |

- **`noModule` excluded.** The first figure counted every `<script src>`,
  including the polyfill chunk marked `noModule`, which a module-capable
  browser never downloads. The probe now reports the modern-browser figure as
  the budgeted one and the total beside it.
- **CLS added.** "No layout shift" (including the font swap) is now measured,
  not asserted: a `layout-shift` observer, ignoring shifts with recent input,
  reporting Chrome's CLS (the largest session window).

**Script revisions since the original measurement.** The second commit on the #314 branch
made the seed read its two institutions from the bank registry (ADR-0013) and
build its uncategorized rows explicitly (four rows with fixed amounts instead
of copies of the previous row), and taught `module-cost.ts` to report lazy
chunks separately. Neither touches application code or the first-load JS
figure, and the timing probe is unchanged; re-measuring `a8a5f8d` later in
the same session gave the same 317.3 kB and FCP/LCP within noise
(2084 / 6168 ms).

## Redesign final (#327)

The last redesign slice measured every page on the production build, against
`main` at **`46a5b6f`** (every other #312 slice merged) built and served side by
side, back to back on the same machine, with the same throwaway seed. Apple M2,
Chrome for Testing 148 headless, method as above.

**Home, against the budget:**

| Home (`/`)                              | Baseline `a8a5f8d`                    | `main` `46a5b6f` | Redesign final |
| --------------------------------------- | ------------------------------------- | ---------------- | -------------- |
| First-load JS, modern browsers, gzip -9 | 278.7 kB                              | 257.4 kB         | **249.3 kB**   |
| Budget ceiling (baseline + 40 kB)       | 318.7 kB                              |                  | 69.4 kB under  |
| Icons on the route (`route-icons.ts`)   | 8.8 kB (all Lucide, `module-cost.ts`) | 10.0 kB          | 10.9 kB        |
| FCP, median of 7, CPU 6x + Slow 4G      | 2120 ms                               | 2140 ms          | 2156 ms        |
| LCP, median of 7, CPU 6x + Slow 4G      | 6060 ms                               | 2356 ms          | 2372 ms        |
| CLS, median of 7                        | 0.000                                 | 0.000            | 0.000          |

The redesign ends 29.4 kB _below_ the pre-redesign home. FCP is within noise
of both references (the `main` and final runs were back to back; the baseline
was measured in another session), and LCP is far earlier than the baseline's
because the home's largest element now renders with the hero. #327's own
change to home: −8.1 kB, from dropping the unused `motion` library (about
11 kB eager on every route) net of the category glyphs below. First-load
figures are from the final build (after #359's review fixes, which added
0.1–0.3 kB per route); the `main` / final timing pairs come from the
back-to-back runs one build earlier. A re-run of home on the final build
gave FCP 2100 ms, LCP 2300 ms, CLS 0.000 (median of 7).

**Every page** (first-load JS gzip -9; icons; FCP / LCP / CLS median of 3,
CPU 6x + Slow 4G; `main` `46a5b6f` → final):

| Route             | First-load JS    | Icons (glyphs)           | FCP / LCP final | CLS   |
| ----------------- | ---------------- | ------------------------ | --------------- | ----- |
| `/transactions`   | 240.5 → 223.2 kB | 10.0 (65) → 4.3 (25) kB  | 2140 / 5260 ms  | 0.000 |
| `/reports`        | 235.7 → 218.3 kB | 10.0 (65) → 4.2 (24) kB  | 2100 / 2148 ms  | 0.000 |
| `/reconciliation` | 235.9 → 217.6 kB | 10.0 (65) → 3.2 (15) kB  | 2104 / 2152 ms  | 0.000 |
| `/subscriptions`  | 206.2 → 189.0 kB | 10.0 (65) → 3.6 (18) kB  | 2160 / 2228 ms  | 0.000 |
| `/sync`           | 236.6 → 220.0 kB | 10.0 (65) → 4.0 (21) kB  | 2096 / 2144 ms  | 0.000 |
| `/settings`       | 297.7 → 284.8 kB | 10.0 (65) → 10.7 (61) kB | 2140 / 2376 ms  | 0.000 |
| `/login`          | 171.5 → 150.1 kB | 10.0 (65) → 0.4 (1) kB   | 2172 / 2172 ms  | 0.000 |
| `/setup`          | final 264.3 kB   |                          | 2484 / 2532 ms  | 0.000 |

`main`'s FCP / LCP for the same routes were within ±50 ms of these except
`/subscriptions` (2420 / 2488 ms on `main`), and every `main` CLS was 0.000.
`/setup` (one build earlier) was measured on a second, empty throwaway database (the wizard
redirects once onboarding is complete).

**Icons per route.** On `main`, Turbopack put every glyph any route used into
one chunk that every route loaded (65 glyphs, 10.0 kB gz everywhere), against
ADR-0015's claim. #327 generates one module per glyph and declares the icon
directory free of side effects, so each route carries only its own glyphs. The
whole 79-glyph set is 13.0 kB gz (`module-cost.ts`), but no route loads it.
Home (10.9 kB) and settings (10.7 kB) are 0.9 and 0.7 kB over the ~10 kB
icon budget, because both can draw any of the 31 category marks (the picker's
Phosphor names and the Lucide names older `categories.icon` rows hold); every
other route is at 4.3 kB or less. Home's first-load JS as a whole stays 69.4 kB
under its ceiling.

Per-route icons are measured with

```sh
BASE_URL=http://localhost:3400 ENCRYPTION_KEY=${PERF_KEY:?} npx tsx scripts/perf/route-icons.ts
```

which lists the glyphs defined in each route's first-load chunks and bundles
exactly those (gzip -9).

## Reproducing the measurement

Everything runs against a throwaway database (never the dev DB, which holds
real data) seeded with invented rows.

Every command that touches the database gets the throwaway URL inline, never
from an `export` a later shell might lack: `drizzle.config.ts` and the seed
load the project `.env`, whose `DATABASE_URL` is the real dev database. Both
`migrate-throwaway.ts` and the seed refuse any database whose name does not
end in `_perf` or `_t<number>` (`scripts/perf/throwaway-db.ts`). The build and
server have no such guard, so every step reads the URL through `${PERF_DB:?}`,
which aborts the command in a shell where `PERF_DB` is unset instead of letting
Next fall back to `.env`.

```sh
# 1. Throwaway database, migrated and seeded with synthetic data.
docker exec yitra-db-1 createdb -U yitra yitra_perf
PERF_DB=postgres://yitra:yitra_dev@localhost:5432/yitra_perf
PERF_KEY=$(openssl rand -hex 32)   # any fresh key; the probe signs its session with it
DATABASE_URL=${PERF_DB:?} npx tsx scripts/perf/migrate-throwaway.ts
DATABASE_URL=${PERF_DB:?} ENCRYPTION_KEY=${PERF_KEY:?} npx tsx scripts/perf/seed-synthetic.ts

# 2. Production build and server.
rm -rf .next && DATABASE_URL=${PERF_DB:?} ENCRYPTION_KEY=${PERF_KEY:?} AI_PROVIDER=off npm run build
DATABASE_URL=${PERF_DB:?} ENCRYPTION_KEY=${PERF_KEY:?} AI_PROVIDER=off PORT=3400 npm start &

# 3. Probe: first-load JS + 7 throttled cold loads (plus one discarded warm-up).
BASE_URL=http://localhost:3400 ENCRYPTION_KEY=${PERF_KEY:?} \
CHROMIUM_PATH="<path to a Chrome/Chromium binary>" \
npx tsx scripts/perf/measure.ts

# 4. Library cost (see below), then clean up.
npx tsx scripts/perf/module-cost.ts src/components/icons/index.ts
docker exec yitra-db-1 dropdb -U yitra yitra_perf
```

`ROUTE=/transactions` (any route) and `RUNS=n` are optional overrides of the
probe.

### What the probe measures (`scripts/perf/measure.ts`)

- **First-load JS**: requests the route's server-rendered HTML with a minted
  session cookie, takes every `<script src="….js">` in it, gzips each file at
  level 9 and sums. The budgeted figure leaves out `noModule` scripts: it is
  the JS a modern browser must download before the route is interactive. The
  total including the polyfill chunk is printed beside it. Chunks loaded later
  (`next/dynamic`, lazy features) are not included.
- **FCP / LCP / CLS**: for each run, a fresh incognito browser context, cache
  disabled, 390×844 viewport at DPR 2 with mobile emulation,
  `emulateCPUThrottling(6)` and puppeteer's `PredefinedNetworkConditions["Slow 4G"]`
  (≈1.44 Mbps down, ≈675 kbps up, 562.5 ms latency, i.e. DevTools' Slow 4G
  preset). Navigation waits for `networkidle0` plus one second; FCP comes from
  the paint timing entry, LCP from the last `largest-contentful-paint` entry,
  and CLS from `layout-shift` entries without recent input (largest session
  window: shifts under 1 s apart, window capped at 5 s). One warm-up load is discarded, then the median of `RUNS` (default 7)
  is reported.
- **JS transferred**: the encoded bytes of every JavaScript response during
  the throttled load, including lazily loaded chunks. It is lower than the
  first-load figure because `next start` serves brotli where the browser
  accepts it; use it only to spot lazy chunks, not for the budget.

### Library cost (`scripts/perf/module-cost.ts`)

Icon and animation costs are measured separately from the route, so a PR can
state what a library adds before a page uses it. The script bundles an entry
module the way a production client chunk is built (esbuild, minified,
tree-shaken, `NODE_ENV=production`, React external because every route already
ships it), keeps every export of the entry, and reports gzip -9 bytes. The
figure is therefore the cost of the whole module; a route that imports only
part of it pays at most that much.

```sh
npx tsx scripts/perf/module-cost.ts <entry.ts> [<entry.ts> ...]
```

The Lucide row in the baseline table came from a `--lucide-in-use` option that
was removed with Lucide (#327).

- **Icons**: passing the icon barrel (`src/components/icons/index.ts`) gives
  the cost of the whole glyph set. Since #327 every glyph is its own module and
  a route ships only the glyphs it imports, so the budget is checked per route
  on the production build (see "Redesign final" below for the method).
- **Motion**: the `motion` library was removed in #327 (see ADR-0015). When it
  was in use, this script misreported it (esbuild does not split it the way
  Turbopack does); a route-level `measure.ts` delta was the authoritative
  figure.

### Seed data (`scripts/perf/seed-synthetic.ts`)

Deterministic invented data ending on the day it runs: two connected
institutions (one bank account, one card), 13 months of transactions (salary,
rent, subscriptions, investment deposit, groceries, cafés, fuel, and so on,
about 480 rows), four uncategorized rows, three budgets, an expense and a
savings target, one savings goal, four confirmed recurring charges (rent and
three subscriptions) and a successful sync six hours earlier. Every merchant
name and amount is made up.
The script refuses any database not named as throwaway and any database that
already holds credentials or transactions.
