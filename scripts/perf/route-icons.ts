import { createHmac, randomBytes } from "crypto";
import { gzipSync } from "zlib";
import { resolve } from "path";
import { build } from "esbuild";

/**
 * Per-route icon cost (docs/perf-baseline.md, "Redesign final"). For each
 * route, reads the first-load chunks named in its server-rendered HTML, lists
 * the Phosphor glyphs they define, and bundles exactly those glyphs from
 * `@/components/icons` (minified, gzip -9) — the icon bytes that route pays.
 * Run against a PRODUCTION server backed by the synthetic seed:
 *
 *   BASE_URL=http://localhost:3400 ENCRYPTION_KEY=<the server's key> \
 *   npx tsx scripts/perf/route-icons.ts
 *
 * Optional: ROUTES (comma-separated), VERBOSE=1 to print each route's glyphs.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROUTES = (
  process.env.ROUTES ??
  "/,/transactions,/reports,/reconciliation,/subscriptions,/sync,/settings,/login"
).split(",");

// Mirrors createSession (src/lib/auth/session.ts); see measure.ts.
function mintSessionCookie(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY (the server's) is required to mint a session.");
  const data = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", Buffer.from(key, "hex")).update(data).digest("hex");
  return `${data}.${sig}`;
}

/** Each generated glyph module calls glyph("<Name>", { <weight>: … }). */
const GLYPH_DEFINITION = /\("([A-Z][A-Za-z]+)",\{(?:regular|fill|duotone):/g;

async function iconBytes(names: string[]): Promise<number> {
  if (names.length === 0) return 0;
  const result = await build({
    stdin: {
      contents: `export { ${names.map((n) => `${n}Icon`).join(", ")} } from "@/components/icons";`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    write: false,
    jsx: "automatic",
    // React and Phosphor's shared render base are paid once by every route.
    external: ["react", "react-dom", "react/jsx-runtime", "@phosphor-icons/react/*"],
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": resolve("src") },
    logLevel: "silent",
  });
  const bytes = Buffer.concat(result.outputFiles.map((f) => Buffer.from(f.contents)));
  return gzipSync(bytes, { level: 9 }).length;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

async function main() {
  const cookie = `yitra-session=${mintSessionCookie()}`;
  for (const route of ROUTES) {
    const res = await fetch(new URL(route, BASE_URL), { headers: { cookie }, redirect: "manual" });
    if (res.status !== 200) {
      console.log(`${route}: GET returned ${res.status}, skipped`);
      continue;
    }
    const html = await res.text();
    const srcs = new Set(
      [...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*>/g)]
        .filter(([tag]) => !/\bnomodule\b/i.test(tag))
        .map(([, src]) => src),
    );
    let firstLoad = 0;
    const glyphs = new Set<string>();
    for (const src of srcs) {
      const body = Buffer.from(await (await fetch(new URL(src, BASE_URL))).arrayBuffer());
      firstLoad += gzipSync(body, { level: 9 }).length;
      for (const m of body.toString("utf8").matchAll(GLYPH_DEFINITION)) glyphs.add(m[1]);
    }
    const names = [...glyphs].sort();
    console.log(
      `${route}: first-load JS ${kb(firstLoad)} gz; ${names.length} glyphs, ` +
        `icons ${kb(await iconBytes(names))} gz`,
    );
    if (process.env.VERBOSE) console.log(`  ${names.join(" ")}`);
  }
}

main().catch((err) => {
  console.error("route-icons failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
