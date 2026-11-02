import { describe, it, expect } from "vitest";
import { parseTransactionsView, transactionsViewQuery, transactionsHref } from "../view-params";

const CATEGORY = "3f0c9a52-6a1e-4c1b-9d55-0b8f2a7e4c11";

function parse(query: string) {
  return parseTransactionsView(new URLSearchParams(query));
}

describe("parseTransactionsView", () => {
  it("reads an empty query as the unfiltered first page", () => {
    expect(parse("")).toEqual({
      dateFrom: "",
      dateTo: "",
      categoryId: "",
      status: "",
      search: "",
      page: 1,
      pageSize: 50,
    });
  });

  it("reads uncategorized=true as the uncategorized view", () => {
    expect(parse("uncategorized=true").categoryId).toBe("__uncategorized__");
  });

  it("reads needsReview=true as the review queue, winning over uncategorized and a category", () => {
    expect(parse(`needsReview=true&uncategorized=true&categoryId=${CATEGORY}`).categoryId).toBe(
      "__needs_review__",
    );
  });

  it("reads a category id", () => {
    expect(parse(`categoryId=${CATEGORY}`).categoryId).toBe(CATEGORY);
  });

  it("reads status, search, dates, page and page size", () => {
    expect(
      parse(
        "status=pending&search=%D7%A7%D7%A4%D7%94&dateFrom=2026-03-01&dateTo=2026-03-15&page=3&pageSize=100",
      ),
    ).toEqual({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-15",
      categoryId: "",
      status: "pending",
      search: "קפה",
      page: 3,
      pageSize: 100,
    });
  });

  it("drops values the listing would reject instead of failing the whole view", () => {
    expect(
      parse(
        "categoryId=not-a-uuid&status=void&dateFrom=yesterday&dateTo=2026-13-45&page=-2&pageSize=7",
      ),
    ).toEqual(parse(""));
  });

  it("reads month=YYYY-MM as that calendar month's date range", () => {
    const view = parse("month=2026-04");
    expect([view.dateFrom, view.dateTo]).toEqual(["2026-04-01", "2026-04-30"]);
  });

  it("ends a leap-year February on the 29th", () => {
    expect(parse("month=2028-02").dateTo).toBe("2028-02-29");
  });

  it("lets an explicit date bound win over month", () => {
    const view = parse("month=2026-04&dateFrom=2026-04-10");
    expect([view.dateFrom, view.dateTo]).toEqual(["2026-04-10", "2026-04-30"]);
  });

  it("ignores a malformed month", () => {
    expect(parse("month=2026-4").dateFrom).toBe("");
  });
});

describe("transactionsViewQuery", () => {
  it("writes the unfiltered first page as an empty query", () => {
    expect(transactionsViewQuery(parse("")).toString()).toBe("");
  });

  it("writes a view that reads back as the same view", () => {
    const view = {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      categoryId: CATEGORY,
      status: "completed",
      search: "ספר",
      page: 4,
      pageSize: 25,
    };
    expect(parseTransactionsView(transactionsViewQuery(view))).toEqual(view);
  });

  it("writes the review queue as needsReview=true", () => {
    expect(transactionsViewQuery({ ...parse(""), categoryId: "__needs_review__" }).toString()).toBe(
      "needsReview=true",
    );
  });
});

describe("transactionsHref", () => {
  it("links to the unfiltered page", () => {
    expect(transactionsHref()).toBe("/transactions");
  });

  it("links to the uncategorized view with the URL the dashboard already uses", () => {
    expect(transactionsHref({ uncategorized: true })).toBe("/transactions?uncategorized=true");
  });

  it("links to the review queue", () => {
    expect(transactionsHref({ needsReview: true })).toBe("/transactions?needsReview=true");
  });

  it("links to one category in one month", () => {
    expect(transactionsHref({ categoryId: CATEGORY, month: "2026-10" })).toBe(
      `/transactions?categoryId=${CATEGORY}&month=2026-10`,
    );
  });

  it("links to a search that the page reads back", () => {
    const href = transactionsHref({ search: "מאפייה", status: "pending" });
    const view = parseTransactionsView(new URL(href, "http://x").searchParams);
    expect([view.search, view.status]).toEqual(["מאפייה", "pending"]);
  });
});
