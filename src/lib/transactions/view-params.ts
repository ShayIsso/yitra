/**
 * The transactions page's URL contract: which filtered, paged view a
 * `/transactions?…` link opens. The page reads its whole view from the URL,
 * so reload and back/forward keep it, and any other surface can deep-link to
 * a filtered view with `transactionsHref`. The query names are the
 * listing API's own (`transactionFiltersSchema`), plus a `month` shorthand.
 * No DB import, so client components may import it.
 */
import { z } from "zod";
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

const isoDate = z.iso.date();
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Malformed input reads as "no constraint": a stale or hand-edited link still opens. */
const viewSchema = z.object({
  categoryId: z.uuid().catch(""),
  status: z.enum(["completed", "pending", ""]).catch(""),
  search: z.string().catch(""),
  dateFrom: isoDate.catch(""),
  dateTo: isoDate.catch(""),
  month: isoMonth.catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(DEFAULT_PAGE_SIZE),
});

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
  const raw = viewSchema.parse({
    categoryId: params.get("categoryId") ?? undefined,
    status: params.get("status") ?? undefined,
    search: params.get("search") ?? "",
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    month: params.get("month") ?? undefined,
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
  });
  const range = raw.month ? monthRange(raw.month) : null;
  // needsReview wins over uncategorized, which wins over a category — the
  // listing's own precedence (`resolveCategoryFilter`).
  const categoryId =
    params.get("needsReview") === "true"
      ? NEEDS_REVIEW
      : params.get("uncategorized") === "true"
        ? UNCATEGORIZED
        : raw.categoryId;
  return {
    dateFrom: raw.dateFrom || range?.first || "",
    dateTo: raw.dateTo || range?.last || "",
    categoryId,
    status: raw.status,
    search: raw.search,
    page: raw.page,
    pageSize: raw.pageSize,
  };
}
