# ADR-0003: Sequential bank scraping with per-bank failure isolation

**Status:** Accepted
**Date:** 2026-03-10 (MVP build, retroactively recorded 2026-05-05)

## Context

ShayFinance scrapes three Israeli banks: Bank Discount, Max, and Cal. The library is `israeli-bank-scrapers-core` driving a Puppeteer browser. Two design questions had to be resolved:

1. **Concurrency** — run all banks in parallel for speed, or sequentially?
2. **Failure handling** — if one bank fails (login error, OTP timeout, site change), should the whole sync abort or should the others continue?

Constraints and observations:

- Each bank requires a fresh Puppeteer browser instance (heavy: ~150–250 MB RAM during scrape).
- Bank Discount issues an OTP that the user has to type within 3 minutes. Running multiple OTP-issuing banks in parallel would create overlapping prompts the user couldn't track.
- Bank sites change without notice. A failure in Max should not cost the user their Discount and Cal data for that sync.
- The user is human, watching SSE progress in the UI. Sequential progress reads naturally; parallel logs are confusing.

## Decision

- **Sequential:** Discount → Max → Cal, one at a time.
- **Per-bank failure isolation:** each bank runs in its own try/finally. A failure (any kind) is yielded as a typed error event over SSE, the browser is closed in `finally`, and the next bank starts. Failed banks do not block the rest.
- **Streaming import:** transactions are imported per-bank as they arrive, not batched at the end of the sync. If sync aborts mid-run, partial progress is persisted.
- **Browser lifecycle:** one Puppeteer browser per bank, created at the start of that bank's run, closed in the `finally` block. Never reused across banks.

## Consequences

- **Locks in:** sync duration scales with `sum(per-bank time)`, not `max(per-bank time)`. ~3–5 minutes total when all three succeed.
- **Locks in:** the SSE event protocol (per-bank progress, per-bank errors, OTP request/response) is the user-facing contract. New banks must fit this protocol.
- **Precludes:** simple parallelisation as a "speed-up" — would require redesigning OTP UX, error reporting, and the user's mental model.
- **Implications for Phase 2 scheduler:** background sync (BACKLOG.md) inherits this contract. The scheduler injects an OTP-skip handler instead of blocking; banks that need OTP are skipped, the rest run. This is consistent with per-bank failure isolation.
- **Phase 2 reconciliation:** because import is per-bank streaming, reconciliation runs _after_ the full sync completes (post-import hook in the sync orchestrator) — see `ARCHITECTURE.md` §5.

## Clarification 2026-10-15

Two statements above were inaccurate in the original wording; the decision itself (sequential, failure-isolated, streaming import, one browser per bank) stands.

- **Scrape order.** The Decision's "Discount → Max → Cal" records the order the three launch banks were first connected, not an ordering the code enforces. `syncAllBanks` (`src/lib/sync/index.ts`) iterates stored credentials by creation time (`listCredentials` orders by `createdAt` ascending), so the order is whatever order the user added institutions in, for any number of institutions. Sequential, one-at-a-time execution is the invariant; the particular order is not.
- **Discount and OTP.** The Context's claim that Bank Discount issues an OTP the user must type within 3 minutes does not hold for the patched Discount scraper, which never calls the OTP retriever. Since #292 the bank registry records Discount as `issuesOtp: false`, pinned to the library by a cross-check test (ADR-0013). The OTP bridge itself is unchanged: every scrape is still handed an `otpCodeRetriever`, and the prompt (with its 3-minute window) is event-driven, raised only when an institution's login actually challenges for a code. Which institutions do so is a registry fact, not something this ADR should state.

Neither correction changes the decision. The overlapping-prompt concern in the Context remains the reason sequential execution is kept for any OTP-issuing institution.
