import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { gzipSync } from "zlib";
import { build } from "esbuild";

/**
 * Client-bundle cost of a module, isolated from the rest of the app
 * (docs/perf-baseline.md, "Library cost"). Each entry is bundled the way a
 * production client chunk is — minified, tree-shaken, NODE_ENV=production,
 * React external because every route already pays for it — and everything the
 * entry exports is kept, so the figure is the cost of the WHOLE module. A
 * route that imports only part of it pays at most this much.
 *
 *   npx tsx scripts/perf/module-cost.ts <entry.ts> [<entry.ts> ...]
 *   npx tsx scripts/perf/module-cost.ts --lucide-in-use
 *
 * `--lucide-in-use` measures every lucide-react icon imported anywhere under
 * src/ — the icon set the Phosphor migration replaces.
 */

const REACT_EXTERNALS = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"];

async function bundledBytes(options: { entry?: string; contents?: string }): Promise<Buffer> {
  const result = await build({
    ...(options.entry
      ? { entryPoints: [options.entry] }
      : { stdin: { contents: options.contents!, resolveDir: process.cwd(), loader: "ts" } }),
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    write: false,
    jsx: "automatic",
    external: REACT_EXTERNALS,
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": resolve("src") },
    logLevel: "silent",
  });
  return Buffer.concat(result.outputFiles.map((f) => Buffer.from(f.contents)));
}

function report(label: string, bytes: Buffer) {
  const gz = gzipSync(bytes, { level: 9 }).length;
  console.log(
    `${label}: ${(gz / 1024).toFixed(1)} kB gz (${(bytes.length / 1024).toFixed(1)} kB min)`,
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function lucideIconsInUse(): string[] {
  const names = new Set<string>();
  for (const file of sourceFiles("src")) {
    for (const m of readFileSync(file, "utf8").matchAll(
      /import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g,
    )) {
      for (const part of m[1].split(",")) {
        const name = part
          .replace(/\btype\b/, "")
          .split(/\s+as\s+/)[0]
          .trim();
        if (name && /^[A-Z]/.test(name)) names.add(name);
      }
    }
  }
  return [...names].sort();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) throw new Error("Pass one or more entry files, or --lucide-in-use.");
  for (const arg of args) {
    if (arg === "--lucide-in-use") {
      const icons = lucideIconsInUse();
      const contents = `export { ${icons.join(", ")} } from "lucide-react";`;
      report(`lucide-react, ${icons.length} icons in use`, await bundledBytes({ contents }));
    } else {
      report(arg, await bundledBytes({ entry: arg }));
    }
  }
}

main().catch((err) => {
  console.error("module-cost failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
