/**
 * The transactions page's URL contract: which filtered, paged view a
 * `/transactions?…` link opens. The page reads its whole view from the URL,
 * so reload and back/forward keep it, and any other surface can deep-link to
 * a filtered view with `transactionsHref`. The query names are the
 * listing API's own (`transactionFiltersSchema`), plus a `month` shorthand.
 * No DB import, so client components may import it.
 */
import { buildFilterSearchParams, type ExportFilterParams } from "./filter-params";

/** `categoryId` sentinels for the two non-category views (see `buildFilterSearchParams`). */
export const UNCATEGORIZED = "__uncategorized__";
export const NEEDS_REVIEW = "__needs_review__";

export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export type TransactionsView = ExportFilterParams & {
  page: number;
  pageSize: number;
};

// Hand-rolled rather than Zod: this module ships in the page's client bundle,
// where Zod alone adds tens of kB gz. The listing API still validates with
// `transactionFiltersSchema`; these guards only keep a malformed link from
// reaching it. Malformed input reads as "no constraint", so a stale or
// hand-edited link still opens.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}

function monthRange(month: string): { first: string; last: string } {
  const [year, mm] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The URL query for a view, omitting the defaults (first page, default page size). */
export function transactionsViewQuery(view: TransactionsView): URLSearchParams {
  const params = buildFilterSearchParams(view);
  if (view.page !== 1) params.set("page", String(view.page));
  if (view.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(view.pageSize));
  return params;
}

/** What another surface can link to; every field is optional. */
export type TransactionsLink = {
  uncategorized?: boolean;
  needsReview?: boolean;
  categoryId?: string;
  /** `YYYY-MM`; read as that month's date range. */
  month?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: "completed" | "pending";
  search?: string;
};

export function transactionsHref(link: TransactionsLink = {}): string {
  const params = new URLSearchParams();
  if (link.needsReview) params.set("needsReview", "true");
  else if (link.uncategorized) params.set("uncategorized", "true");
  else if (link.categoryId) params.set("categoryId", link.categoryId);
  if (link.month) params.set("month", link.month);
  if (link.dateFrom) params.set("dateFrom", link.dateFrom);
  if (link.dateTo) params.set("dateTo", link.dateTo);
  if (link.status) params.set("status", link.status);
  if (link.search) params.set("search", link.search);
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}

export function parseTransactionsView(params: URLSearchParams): TransactionsView {
  const date = (name: string) => {
    const value = params.get(name) ?? "";
    return isIsoDate(value) ? value : "";
  };
  const month = params.get("month") ?? "";
  const range = ISO_MONTH.test(month) ? monthRange(month) : null;
  const category = params.get("categoryId") ?? "";
  const status = params.get("status") ?? "";
  const pageSize = positiveInt(params.get("pageSize"));
  // needsReview wins over uncategorized, which wins over a category — the
  // listing's own precedence (`resolveCategoryFilter`).
  const categoryId =
    params.get("needsReview") === "true"
      ? NEEDS_REVIEW
      : params.get("uncategorized") === "true"
        ? UNCATEGORIZED
        : UUID.test(category)
          ? category
          : "";
  return {
    dateFrom: date("dateFrom") || range?.first || "",
    dateTo: date("dateTo") || range?.last || "",
    categoryId,
    status: status === "completed" || status === "pending" ? status : "",
    search: params.get("search") ?? "",
    page: positiveInt(params.get("page")) ?? 1,
    pageSize:
      pageSize !== null && (PAGE_SIZES as readonly number[]).includes(pageSize)
        ? pageSize
        : DEFAULT_PAGE_SIZE,
  };
}
