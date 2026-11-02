/**
 * The perf scripts write to a database, and the dev database holds real
 * financial data. They only ever act on a database whose name marks it as
 * throwaway: `<anything>_perf` or `<anything>_t<ticket number>`.
 */
const THROWAWAY_NAME = /^[a-z0-9_]+_(perf|t\d+)$/;

export function assertThrowawayDatabase(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL must be set inline to a throwaway database.");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!THROWAWAY_NAME.test(name)) {
    throw new Error(
      `Refusing to touch database "${name || "(default)"}": its name must end in _perf or _t<number>.`,
    );
  }
  return url;
}
