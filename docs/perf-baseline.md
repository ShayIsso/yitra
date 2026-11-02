# Performance baseline (pre-redesign)

The whole-app redesign (#312) has a hard performance budget: the home route may
not get slower to show its first meaningful content on a slow phone, and its
first-load JS may grow by **at most +40 kB gzipped in total** across every
redesign PR, icons included (icons alone ≤ ~10 kB gz). This file records the
numbers every redesign PR compares against, and the exact method to reproduce
them.

## Baseline numbers

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

**Script revisions since the baseline.** The second commit on the #314 branch
made the seed read its two institutions from the bank registry (ADR-0013) and
build its uncategorized rows explicitly (four rows with fixed amounts instead
of copies of the previous row), and taught `module-cost.ts` to report lazy
chunks separately. Neither touches application code or the first-load JS
figure, and the timing probe is unchanged; re-measuring `a8a5f8d` later in
the same session gave the same 317.3 kB and FCP/LCP within noise
(2084 / 6168 ms).

## Reproducing the measurement

Everything runs against a throwaway database (never the dev DB, which holds
real data) seeded with invented rows.

```sh
# 1. Throwaway database, migrated and seeded with synthetic data.
docker exec yitra-db-1 createdb -U yitra yitra_perf
export DATABASE_URL=postgres://yitra:yitra_dev@localhost:5432/yitra_perf
export ENCRYPTION_KEY=$(openssl rand -hex 32)   # any fresh key; the probe signs its session with it
export AI_PROVIDER=off
npm run db:migrate
npx tsx scripts/perf/seed-synthetic.ts

# 2. Production build and server.
rm -rf .next && npm run build
PORT=3400 npm start &

# 3. Probe: first-load JS + 7 throttled cold loads (plus one discarded warm-up).
BASE_URL=http://localhost:3400 \
CHROMIUM_PATH="<path to a Chrome/Chromium binary>" \
npx tsx scripts/perf/measure.ts

# 4. Library cost (see below), then clean up.
npx tsx scripts/perf/module-cost.ts --lucide-in-use
docker exec yitra-db-1 dropdb -U yitra yitra_perf
```

`ROUTE=/transactions` (any route) and `RUNS=n` are optional overrides of the
probe.

### What the probe measures (`scripts/perf/measure.ts`)

- **First-load JS**: requests the route's server-rendered HTML with a minted
  session cookie, takes every `<script src="….js">` in it, gzips each file at
  level 9 and sums. This is the JS a cold visit must download before the route
  is interactive; chunks loaded later (`next/dynamic`, lazy features) are not
  included.
- **FCP / LCP**: for each run, a fresh incognito browser context, cache
  disabled, 390×844 viewport at DPR 2 with mobile emulation,
  `emulateCPUThrottling(6)` and puppeteer's `PredefinedNetworkConditions["Slow 4G"]`
  (≈1.44 Mbps down, ≈675 kbps up, 562.5 ms latency, i.e. DevTools' Slow 4G
  preset). Navigation waits for `networkidle0` plus one second; FCP comes from
  the paint timing entry and LCP from the last `largest-contentful-paint`
  entry. One warm-up load is discarded, then the median of `RUNS` (default 7)
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
npx tsx scripts/perf/module-cost.ts --lucide-in-use
```

- **Icons**: pass the app's icon module (the single file that names every
  Phosphor icon the app imports). The budget applies to that whole set.
- **Motion**: pass the motion module's entry; its lazily loaded feature bundle
  is a separate entry and is reported separately.

### Seed data (`scripts/perf/seed-synthetic.ts`)

Deterministic invented data ending on the day it runs: two connected
institutions (one bank account, one card), 13 months of transactions (salary,
rent, subscriptions, investment deposit, groceries, cafés, fuel, and so on,
about 480 rows), four uncategorized rows, three budgets, an expense and a
savings target, one savings goal, three confirmed recurring charges and a
successful sync six hours earlier. Every merchant name and amount is made up.
The script refuses to run against the default `yitra` database or any
database that already holds credentials or transactions.
