# <img src="brand/yitra-icon.svg" alt="" height="32"> Yitra

Private, self-hosted personal finance dashboard for Israeli banks and credit cards.

Yitra (יתרה) fetches your transactions with [`israeli-bank-scrapers-core`](https://www.npmjs.com/package/israeli-bank-scrapers-core), categorizes them with rules and a learned merchant memory, and tracks savings and investment deployment, all in a Hebrew RTL interface. It is single-user and runs on your own machine: your credentials and transactions stay in your own PostgreSQL.

## What it does

- **Sync** transactions on demand from the Sync page, or on a daily schedule. The schedule needs both `SCHEDULER_ENABLED=true` in the environment and the toggle in Settings, and the server reads both only at startup, so restart the server after changing either. Institutions are scraped one at a time, and one failing does not stop the rest.
- **Categorize** with rules you author deliberately, merchant memory learned from your manual assignments, and optional AI suggestions (off by default, see [Privacy and Security](#privacy-and-security)).
- **Reconcile** credit-card settlement charges, debit/Bit mirrors and inter-account transfers so nothing is counted twice.
- **Understand your money:** net savings and savings rate, investment tracking, budgets, goals, reports, and recurring-expense and subscription detection.
- **Edit and search** transactions inline. Installments and multi-currency are supported.

The app's pages are Dashboard, Transactions, Sync and Settings, plus Subscriptions, Reconciliation and Reports.

## Supported institutions

Institutions come from a single registry ([ADR-0013](docs/adr/0013-declarative-bank-registry.md)). `src/lib/bank-registry/entries.ts` is the authoritative list, and the app's institution picker shows what is available.

| Tier             | Meaning                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verified**     | Bank Discount, Max and Cal. The maintainer has tested these against real accounts.                                                                                                                                                          |
| **Experimental** | Every other institution the underlying library supports. The library has a scraper for it, but nobody on this project has run it against a real account. The app labels it "experimental" and asks you to acknowledge that when you add it. |

Experimental is a statement about testing, not about a different code path: an experimental institution goes through exactly the same scraper, import and categorization as a verified one. If it fails, that is usually the bank's site, the library, or an untested login shape, not evidence that something is wrong with your install. Once a sync for that institution succeeds on your install, the label changes to "observed", which is your own evidence. If one fails, report it upstream to the scraper library or as an issue here, without credentials, account numbers or raw bank responses.

## Tech Stack

| Layer     | Technology                             |
| --------- | -------------------------------------- |
| Framework | Next.js (App Router) + TypeScript      |
| Styling   | Tailwind CSS + Shadcn UI               |
| Database  | PostgreSQL + Drizzle ORM               |
| Scraping  | israeli-bank-scrapers-core + Puppeteer |
| Forms     | React Hook Form + Zod                  |
| Mutations | Next.js Server Actions                 |
| Charts    | Shadcn Charts (Recharts)               |
| Testing   | Vitest                                 |

## Prerequisites

- Node.js >= 22.13.0 (required by `israeli-bank-scrapers-core`; the Docker image uses Node 22)
- Docker and Docker Compose (for PostgreSQL, and for the containerized setup below)
- Google Chrome or Chromium on the host when running the app natively (scraping drives a real browser)

Developed and run on macOS. The app image is built from Linux base images for your machine's architecture (amd64 or arm64), so the containerized setup should also work on Windows through Docker Desktop with WSL 2, but nobody has tested Windows yet; running natively on Windows is untested too.

## Getting Started

```bash
git clone https://github.com/ShayIsso/yitra.git
cd yitra
npm install

# 1. Create your .env and generate the encryption key
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the printed value as ENCRYPTION_KEY in .env.
# Keep a copy somewhere safe: without it, stored bank credentials cannot be decrypted.

# 2. Start PostgreSQL
docker compose up db -d

# 3. Create the schema from empty
npm run db:migrate

# 4. Run the app
npm run dev
```

If Chrome is not at the macOS path set in `.env.example`, set `CHROMIUM_PATH` to your Chrome or Chromium executable.

Open [http://localhost:3000](http://localhost:3000). On the first visit the setup wizard walks you through:

1. choosing the app password (the only mandatory step; there is no hash to generate by hand),
2. the default category taxonomy,
3. adding a bank,
4. an AI categorization provider (defaults to off),
5. a first sync, which you can skip and run later from the Sync page.

Every step after the password can be skipped and revisited from the app. The wizard seeds the default categories itself, so do **not** run `npm run db:seed` by hand on a fresh install (that command is for re-seeding from the command line).

If `DATABASE_URL` or `ENCRYPTION_KEY` is missing or invalid, every page shows a diagnostic naming the variable and the command that produces it.

The default taxonomy is a set of Hebrew categories for income, expenses (grouped into food, home and bills, and leisure and shopping), investments, transfers and ignored items. `src/db/taxonomy.ts` holds the current definition.

### Running in Docker

`docker-compose.yml` has two modes: the `db` service alone for development (above), and the `production` profile, which also builds and runs the app image (multi-stage Dockerfile, bundled Chromium, non-root user, port 3000).

```bash
# .env must contain ENCRYPTION_KEY (see above)
docker compose up db -d
npm run db:migrate           # run from a checkout; the app image does not migrate on boot
docker compose --profile production up -d --build
```

Notes:

- The container does not run migrations. Apply them with `npm run db:migrate` from a checkout, against the compose database (the default `DATABASE_URL` in `.env.example` reaches it on `localhost:5432`), before the first start and after any update that adds a file under `drizzle/`.
- Compose overrides `DATABASE_URL` and `CHROMIUM_PATH` for the container itself. Everything else comes from `.env`.
- Compose publishes ports 3000 and 5432 on all host interfaces, and the database ships with development credentials. Run it on a machine you control behind a firewall, or restrict the published ports in your own compose override. Do not expose it to the internet.
- Database data lives in the named volume `yitra_pgdata`. The Compose project is pinned to `yitra`, so the checkout directory's name never matters.
- Under Compose a legacy `APP_PASSWORD` hash needs `$` written as `$$`. New installs do not set it.

## Environment Variables

Everything the app reads from the environment (`src/lib/env.ts` is authoritative). Only the first two are required.

| Variable            | Required | Description                                                                                                                                                                                                                                                                               |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | PostgreSQL connection URL, for example `postgres://yitra:change-me@localhost:5432/yitra`. The `.env.example` default matches the bundled compose database.                                                                                                                                |
| `ENCRYPTION_KEY`    | yes      | 64 hex characters (32 bytes). Encrypts bank credentials (AES-256-GCM) and signs the session cookie. Generate it with the `node -e` command above.                                                                                                                                         |
| `APP_PASSWORD`      | no       | Legacy. A bcrypt hash that overrides the password chosen in the setup wizard and wins when set. New installs leave it unset.                                                                                                                                                              |
| `CHROMIUM_PATH`     | no       | Chrome or Chromium executable used for scraping. Set automatically in the Docker image.                                                                                                                                                                                                   |
| `SCHEDULER_ENABLED` | no       | `true` or `false` (default `false`); any other value is invalid. `true` lets the server register the daily background sync at startup, but only if the schedule is also switched on in Settings (which sets its time of day). Both are read at startup, so restart after changing either. |
| `AI_PROVIDER`       | no       | `gemini`, `ollama` or `off`. When set it wins over the choice made in the app. Unset in both places means off.                                                                                                                                                                            |
| `GEMINI_API_KEY`    | no       | Key for the `gemini` provider. It can instead be entered in the app, where it is stored encrypted. `gemini` without a key resolves to off.                                                                                                                                                |
| `OLLAMA_ENDPOINT`   | no       | URL of a local Ollama server, for the `ollama` provider.                                                                                                                                                                                                                                  |
| `OLLAMA_MODEL`      | no       | Model name, for the `ollama` provider.                                                                                                                                                                                                                                                    |

A blank `KEY=` line counts as unset for every optional variable.

**Upgrading an install that uses `APP_PASSWORD`:** keep the override set, sign in, open `/setup` and finish it (every step after the password can be skipped). That records setup as complete, which closes the wizard's password step for good.

> **Warning:** on an install whose setup is not complete, removing or blanking `APP_PASSWORD` reopens the password step. Until a password is chosen, **anyone who can reach the port can claim the install**, along with the data already in it. Only do this on a machine nobody else can reach, and choose the password immediately.

Once setup is complete, removing `APP_PASSWORD` does not reopen the password step. The wizard cannot reset a password; set the override again instead.

## Project Structure

```
src/
  app/              # Next.js App Router pages and API routes
  components/       # Shared UI components
  db/               # Drizzle schema and default-category seed
  lib/              # One deep module per directory; each exposes only its index.ts
drizzle/            # Generated SQL migrations
docs/adr/           # Architecture decision records
```

Run `ls src/lib` for the current module list: a module's name states its responsibility, its `index.ts` its public surface, and its tests its behavior. Domain vocabulary is in [CONTEXT.md](CONTEXT.md).

## How This Project Is Built

Yitra is built with a structured human + AI-agent workflow, and the repository keeps the artifacts of it.

- **Planning.** Each body of work starts with an interview that locks the decisions, becomes a spec issue on GitHub, and is sliced into small vertical tickets. Decisions that outlive a ticket become ADRs in [`docs/adr/`](docs/adr/README.md); domain vocabulary lives in [CONTEXT.md](CONTEXT.md).
- **Roles.** An orchestrator agent writes a self-contained brief per ticket, routes it to a worker agent sized to its risk, and reviews every PR. Each worker implements one ticket in its own git worktree and opens a PR. The maintainer approves decisions and merges.
- **Review by risk.** Routine slices get an architect review. Anything touching shared modules, the schema, security or sync also gets an independent review by an agent that never saw the implementer's reasoning, and UI slices get a headless visual pass in light, dark and phone widths against synthetic data.
- **Guard rails in CI.** Every PR runs six gates: tests, Prettier, ESLint, `tsc --noEmit`, a migration drift check and a production build. Architecture rules are enforced by tests too: no branching on institution ids, every setup Server Action checks the session first, and the bank registry is pinned to the scraper library.

Rules the workflow enforces:

- **Deep modules:** pure functional cores testable without the database; a Store pattern at database boundaries.
- **TDD for computation:** analytics, the rule engine, reconciliation and recurring detection are all written test-first.
- **Zod at every API boundary,** with Hebrew error messages.
- **Zero-leak logging:** no credentials, OTP codes or raw scraper output in logs.
- **Generated migrations only** ([ADR-0009](docs/adr/0009-generated-migrations-from-baseline.md)): schema changes go through `npm run db:generate`, never hand-written SQL.
- **Feature branches and PRs only,** formatted with `npm run format` before every commit.

Agent protocols, security rules and known gotchas are in [CLAUDE.md](CLAUDE.md).

## Documentation

- [CONTEXT.md](CONTEXT.md) — Domain vocabulary and financial invariants
- [docs/adr/](docs/adr/README.md) — Architecture decision records
- [PRD v1 (MVP)](docs/PRD-v1.md) and [PRD Phase 2](docs/PRD-phase2.md) — Historical product requirements
- [Phase 2 Kickoff](docs/phase2-kickoff.md) — Architecture snapshot, strategic debt, journey notes
- [BACKLOG.md](BACKLOG.md) — Deferred features and roadmap
- [CLAUDE.md](CLAUDE.md) — Development guidelines, agent protocols, security rules

## Privacy and Security

- **Zero egress by default.** A fresh install makes no external calls except to your banks, when you sync.
- **The one permitted egress** is optional AI categorization with an external provider (Gemini), which you must choose deliberately. It is gated by a redaction boundary ([ADR-0008](docs/adr/0008-redaction-gated-external-categorization.md)): only redacted merchant descriptors are sent, never credentials, identifiers, account numbers, amounts, dates, or any digit run of five or more. The trade-off is that redacted merchant names still reach the provider.
- **Local AI mode.** `ollama` keeps inference on your machine, but no local model has yet cleared the accuracy bar ([benchmark](docs/ai-categorization-benchmark-phase3.md)), so treat it as available rather than recommended. Leaving the provider off costs nothing else: rules and merchant memory categorize without any model.
- All bank credentials are encrypted at rest (AES-256-GCM, unique IV per record), and the API never returns passwords.
- Password-protected access: a bcrypt hash chosen in the first-run wizard, plus an HTTP-only HMAC-signed session cookie.
- Zero-leak policy: no credentials, OTP codes or raw bank responses in logs.
- Failure screenshots auto-delete after 24 hours.
- Built for local or private-network use by one person. There is no multi-user model and it is not hardened for exposure to the internet.
