import { spawnSync } from "child_process";
import { assertThrowawayDatabase } from "./throwaway-db";

/**
 * `npm run db:migrate` for a throwaway database only (docs/perf-baseline.md).
 * drizzle.config.ts loads the project .env, so a shell that forgot to set
 * DATABASE_URL would migrate the dev database; this refuses first.
 *
 *   DATABASE_URL=postgres://…/yitra_perf npx tsx scripts/perf/migrate-throwaway.ts
 */
const url = assertThrowawayDatabase(process.env.DATABASE_URL);
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
