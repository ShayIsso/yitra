import { createHmac, randomBytes } from "crypto";
import { gzipSync } from "zlib";
import puppeteer, { PredefinedNetworkConditions, type Browser } from "puppeteer-core";

/**
 * Performance probe for the redesign budget (docs/perf-baseline.md). Run it
 * against a PRODUCTION server (`npm run build && npm start`) backed by the
 * synthetic seed — never against a dev server, whose bundles are unminified.
 *
 *   BASE_URL=http://localhost:3314 ENCRYPTION_KEY=<the server's key> \
 *   CHROMIUM_PATH=<chromium binary> npx tsx scripts/perf/measure.ts
 *
 * Optional: ROUTE (default "/"), RUNS (default 7).
 *
 * Reports, for ROUTE:
 *  - first-load JS: every <script src> in the server-rendered HTML, each file
 *    gzipped at level 9 and summed. Deterministic for a given build. The
 *    budgeted figure excludes `noModule` scripts, which modern browsers never
 *    fetch; the total including them is printed beside it.
 *  - FCP, LCP and CLS (median of RUNS cold loads) under 6x CPU throttle and the
 *    DevTools "Slow 4G" profile, 390x844 @2x mobile viewport.
 *  - JS transferred during the throttled load (includes lazily loaded chunks).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROUTE = process.env.ROUTE ?? "/";
const RUNS = Number(process.env.RUNS ?? 7);
const CPU_THROTTLE = 6;
const NETWORK = PredefinedNetworkConditions["Slow 4G"];

// Mirrors createSession (src/lib/auth/session.ts), which cannot be imported
// here: it pulls in next/headers and the full env parse.
function mintSessionCookie(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY (the server's) is required to mint a session.");
  const data = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", Buffer.from(key, "hex")).update(data).digest("hex");
  return `${data}.${sig}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

async function firstLoadJs(session: string) {
  const res = await fetch(new URL(ROUTE, BASE_URL), {
    headers: { cookie: `yitra-session=${session}` },
    redirect: "manual",
  });
  if (res.status !== 200) throw new Error(`GET ${ROUTE} returned ${res.status} (session/seed?)`);
  const html = await res.text();
  const scripts = new Map<string, boolean>();
  for (const [tag, src] of html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*>/g)) {
    scripts.set(src, /\bnomodule\b/i.test(tag));
  }
  const totals = { modern: { raw: 0, gz: 0, files: 0 }, noModule: { raw: 0, gz: 0, files: 0 } };
  for (const [src, isNoModule] of scripts) {
    const body = Buffer.from(await (await fetch(new URL(src, BASE_URL))).arrayBuffer());
    const bucket = isNoModule ? totals.noModule : totals.modern;
    bucket.raw += body.length;
    bucket.gz += gzipSync(body, { level: 9 }).length;
    bucket.files += 1;
  }
  return totals;
}

type RunResult = {
  fcp: number;
  lcp: number;
  lcpElement: string;
  cls: number;
  jsTransferred: number;
};

async function throttledRun(browser: Browser, session: string): Promise<RunResult> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    const origin = new URL(BASE_URL);
    await context.setCookie({
      name: "yitra-session",
      value: session,
      domain: origin.hostname,
      path: "/",
      httpOnly: true,
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.setCacheEnabled(false);
    await page.emulateCPUThrottling(CPU_THROTTLE);
    await page.emulateNetworkConditions(NETWORK);
    await page.evaluateOnNewDocument(() => {
      type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean };
      const w = window as unknown as {
        __lcp: { t: number; el: string };
        __cls: { value: number; windowValue: number; windowStart: number; last: number };
      };
      w.__lcp = { t: 0, el: "" };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { element?: Element })[]) {
          w.__lcp = { t: e.startTime, el: e.element?.tagName.toLowerCase() ?? "?" };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      // CLS as Chrome defines it: the largest session window of shifts not
      // caused by input (shifts < 1 s apart, window capped at 5 s).
      w.__cls = { value: 0, windowValue: 0, windowStart: 0, last: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Shift[]) {
          if (e.hadRecentInput) continue;
          const c = w.__cls;
          if (
            c.windowValue > 0 &&
            e.startTime - c.last < 1000 &&
            e.startTime - c.windowStart < 5000
          ) {
            c.windowValue += e.value;
          } else {
            c.windowValue = e.value;
            c.windowStart = e.startTime;
          }
          c.last = e.startTime;
          c.value = Math.max(c.value, c.windowValue);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    const scriptIds = new Set<string>();
    let jsTransferred = 0;
    // By MIME type, not resource type: Next preloads chunks with
    // <link rel=preload>, which CDP reports as "Other", not "Script".
    cdp.on("Network.responseReceived", (e) => {
      if (e.response.mimeType.includes("javascript")) scriptIds.add(e.requestId);
    });
    cdp.on("Network.loadingFinished", (e) => {
      if (scriptIds.has(e.requestId)) jsTransferred += e.encodedDataLength;
    });

    await page.goto(new URL(ROUTE, BASE_URL).toString(), {
      waitUntil: "networkidle0",
      timeout: 180_000,
    });
    await new Promise((r) => setTimeout(r, 1_000));
    const metrics = await page.evaluate(() => {
      const w = window as unknown as {
        __lcp: { t: number; el: string };
        __cls: { value: number };
      };
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
      return { fcp, lcp: w.__lcp.t, lcpElement: w.__lcp.el, cls: w.__cls.value };
    });
    return { ...metrics, jsTransferred };
  } finally {
    await context.close();
  }
}

async function main() {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) throw new Error("CHROMIUM_PATH is required.");
  const session = mintSessionCookie();

  const { modern, noModule } = await firstLoadJs(session);
  console.log(
    `${ROUTE} first-load JS (modern browsers, budgeted): ${kb(modern.gz)} gz ` +
      `(${kb(modern.raw)} raw, ${modern.files} files); ` +
      `with noModule polyfills: ${kb(modern.gz + noModule.gz)} gz (${noModule.files} noModule files)`,
  );

  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    await throttledRun(browser, session); // warm-up: server caches, DB pool; discarded
    const runs: RunResult[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await throttledRun(browser, session);
      runs.push(r);
      console.log(
        `  run ${i + 1}: FCP ${r.fcp.toFixed(0)} ms, LCP ${r.lcp.toFixed(0)} ms (<${r.lcpElement}>), ` +
          `CLS ${r.cls.toFixed(3)}, JS ${kb(r.jsTransferred)}`,
      );
    }
    console.log(
      `median of ${RUNS} (CPU ${CPU_THROTTLE}x, Slow 4G): FCP ${median(runs.map((r) => r.fcp)).toFixed(0)} ms, ` +
        `LCP ${median(runs.map((r) => r.lcp)).toFixed(0)} ms, ` +
        `CLS ${median(runs.map((r) => r.cls)).toFixed(3)}, ` +
        `JS transferred ${kb(median(runs.map((r) => r.jsTransferred)))}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("measure failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
