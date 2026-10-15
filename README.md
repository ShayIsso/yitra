# <img src="brand/yitra-icon.svg" alt="" height="32"> Yitra

Private, self-hosted personal finance dashboard for Israeli banks and credit cards.

Yitra (יתרה) fetches your transactions with [`israeli-bank-scrapers-core`](https://www.npmjs.com/package/israeli-bank-scrapers-core), categorizes them with rules and a learned merchant memory, and tracks savings and investment deployment, all in a Hebrew RTL interface. It is single-user and runs on your own machine: your credentials and transactions stay in your own PostgreSQL.

## What it does

- **Sync** transactions on demand from the Sync page, or on a daily schedule you switch on in Settings. Institutions are scraped one at a time, and one failing does not stop the rest.
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

- Node.js >= 22.12.0 (the Docker image uses Node 22)
- Docker and Docker Compose (for PostgreSQL, and for the containerized setup below)
- Google Chrome or Chromium on the host when running the app natively (scraping drives a real browser)

## Getting Started

```bash
git clone git@github.com:ShayIsso/yitra.git
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
- Database data lives in the named volume `shayfinance_pgdata`.
- Under Compose a legacy `APP_PASSWORD` hash needs `$` written as `$$`. New installs do not set it.

## Environment Variables

Everything the app reads from the environment (`src/lib/env.ts` is authoritative). Only the first two are required.

| Variable            | Required | Description                                                                                                                                                |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | PostgreSQL connection URL, for example `postgres://yitra:change-me@localhost:5432/yitra`. The `.env.example` default matches the bundled compose database. |
| `ENCRYPTION_KEY`    | yes      | 64 hex characters (32 bytes). Encrypts bank credentials (AES-256-GCM) and signs the session cookie. Generate it with the `node -e` command above.          |
| `APP_PASSWORD`      | no       | Legacy. A bcrypt hash that overrides the password chosen in the setup wizard and wins when set. New installs leave it unset.                               |
| `CHROMIUM_PATH`     | no       | Chrome or Chromium executable used for scraping. Set automatically in the Docker image.                                                                    |
| `SCHEDULER_ENABLED` | no       | `true` registers the daily background sync at server start. Anything else (default `false`) leaves it off. Its time of day is configured in Settings.      |
| `AI_PROVIDER`       | no       | `gemini`, `ollama` or `off`. When set it wins over the choice made in the app. Unset in both places means off.                                             |
| `GEMINI_API_KEY`    | no       | Key for the `gemini` provider. It can instead be entered in the app, where it is stored encrypted. `gemini` without a key resolves to off.                 |
| `OLLAMA_ENDPOINT`   | no       | URL of a local Ollama server, for the `ollama` provider.                                                                                                   |
| `OLLAMA_MODEL`      | no       | Model name, for the `ollama` provider.                                                                                                                     |

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

## How This Project Is Built — AI-Assisted Development

Yitra is developed with a structured human + agent workflow. Every phase moves through the same pipeline:

```
 Grill Me  →  to-prd  →  PRD as GitHub Issue  →  to-issues  →  feature branches  →  review  →  merge
```

### Roles

- **Orchestrator (Opus):** designs architecture, runs `grill-me` interviews, writes the PRD, reviews every PR, makes architectural calls, writes self-contained worker prompts.
- **Workers (Sonnet):** implement one issue at a time from the orchestrator's prompt. Never see prior conversation context — the prompt is the briefing.
- **Human (Shay):** approves architectural decisions, validates PRDs, reviews PRs, runs manual verification against real bank data.

### Skills used

A mix of global skills (Matt Pocock's set, installed via `npx`) and project-local skills under `.claude/skills/` encode repeatable workflows:

| Skill                           | Role                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `grill-me`                      | Interview the user to lock architectural decisions before coding           |
| `grill-with-docs`               | Stress-test a plan against `CONTEXT.md` and `docs/adr/` decisions          |
| `to-prd`                        | Synthesize current conversation into a PRD submitted as a GitHub issue     |
| `to-issues`                     | Slice the PRD into tracer-bullet vertical GitHub issues                    |
| `improve-codebase-architecture` | Find shallow modules, recommend deepening, produce `ARCHITECTURE.md`       |
| `tdd`                           | Red-green-refactor loop for pure computation modules                       |
| `diagnose`                      | Disciplined reproduce → minimise → hypothesise loop for hard bugs          |
| `triage`                        | State-machine triage of incoming issues into the project tracker           |
| `generate-commit-message`       | Produce concise, why-focused commit messages from staged diffs (mandatory) |
| `simplify`                      | Post-implementation review for code reuse, quality, and efficiency         |
| `obsidian-markdown`             | Mirror PRDs and decisions to the Obsidian vault with frontmatter+wikilinks |

### Core rules enforced by the workflow

- **Deep modules:** pure functional cores testable without the DB; Store pattern for DB boundaries.
- **TDD for computation:** analytics, rule engine, reconciliation, recurring detection — all test-first.
- **Zod at every API boundary** with Hebrew error messages.
- **Zero-leak logging:** no credentials, OTP codes, or raw scraper output in logs.
- **Feature branches only:** never commit directly to `main`.
- **PRs include `Closes #N`** so issues auto-close on merge.
- **`npm run format` before every commit** — CI rejects unformatted code.

### Knowledge capture

- Every PRD and kickoff doc lives in `/docs`.
- Every PRD is mirrored to an Obsidian vault (`Self_projects/ShayFinance/`) with frontmatter, wikilinks, and callouts.
- Planned enrichments: JSON Canvas module graphs, inline screenshots, workflow walkthrough videos.

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
