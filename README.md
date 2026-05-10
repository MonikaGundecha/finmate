# FinMate — AI-Powered Personal Finance Manager

FinMate is a single-user, local-first personal finance app that turns natural-language input into structured financial data. Type things like *"spent $12 on lunch"*, *"save $5,000 for a vacation by December"*, *"paid back Tanvi"*, or *"set my monthly budget to $2,000"*, and Claude parses, categorizes, and stores them — then surfaces the result through KPI cards, a trend line, category charts, goals, recurring bills, an owed ledger, and short coaching nudges.

## Screenshots

![FinMate Demo](./public/demo.gif)

## Tech stack

- **Next.js 16** (App Router) — actual installed version; spec-equivalent to "Next.js 14+ App Router"
- **TypeScript** — strict mode, end-to-end types from DB → API → UI
- **SQLite** via `better-sqlite3` (synchronous; no `await` on DB calls)
- **Tailwind CSS v4** — colorblind-safe Okabe-Ito accent palette
- **Recharts** — line, bar, donut, with reference-line budget overlay
- **Anthropic Claude API** — `claude-haiku-4-5` (input parsing) and `claude-sonnet-4-6` (coaching)

## Features

- **Natural-language input** — one bar handles transactions, income, debts, recurring bills, goals, goal contributions, debt settlement, monthly-budget changes, and deletions. Powered by Claude Haiku with a server-side fast-path for clearly-shaped settle phrasings.
- **Spending charts** — three views: an income-vs-expenses trend line (with optional dashed budget reference line), a category bar/donut with Okabe-Ito colors, and a "Top Spenders" panel showing % share of total spend.
- **Goals tracker** — create goals, log contributions ("put $200 toward car goal"), see per-goal progress and an aggregate KPI.
- **Owed ledger** — track who owes you and who you owe, settle in one click (with AI-suggested category for `i_owe` settlements), separate Active / History tabs.
- **Recurring bills** — toggle between *Due in 7 days* and *Due this month*; the dashboard pulls upcoming bills into the Spendable calculation.
- **AI coaching** — Claude Sonnet reviews a compact summary of your activity and produces 1–3 short, specific nudges.
- **Monthly budget tracking** — set a budget by typing a sentence; effective from next month so past months aren't retroactively over-budget. KPI card shows progress with traffic-light coloring; trend line gets a dashed budget overlay.
- **Period selector** — Month / Quarter / YTD with timezone-safe local-date navigation; deltas comparing every KPI to the previous equivalent period.

## Setup

1. **Clone and install**
   ```bash
   git clone <your-repo-url>
   cd financeai
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and replace `your_anthropic_api_key_here` with a real key from <https://console.anthropic.com>.

3. **Run the dev server**
   ```bash
   npm run dev
   ```
   Opens on <http://localhost:3000>.

4. **Optionally seed sample data**
   ```bash
   npx tsx scripts/seed.ts
   ```
   Idempotent — populates 5 months of realistic transactions, two goals, five recurring bills, three owed entries, a $2,000 monthly budget, and a $5,000 opening balance. Skips itself if more than 10 transactions already exist.

## Local-first by design

FinMate runs entirely on your machine. There's no auth, no user accounts, no cloud database, and no telemetry. The SQLite file (`finance.db`) lives in the project root and is `.gitignore`d so your data never leaves the box. The only outbound call is to the Claude API for parsing and coaching — and you control which key signs those requests.

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `DATABASE_PATH` | SQLite DB file path (default: `./finance.db`) |

## Architecture notes

- Money is stored as integer cents everywhere. Convert at the UI boundary via `toDollars` / `toCents` in `lib/utils.ts`.
- The DB is a singleton lazily initialized inside `lib/db.ts` to avoid `SQLITE_BUSY` during Next's parallel build workers.
- All API routes set `dynamic = 'force-dynamic'` and `runtime = 'nodejs'` — required because `better-sqlite3` is a native module.
- The Haiku categorizer can return `{action: "clarify", question: "..."}` when input is ambiguous; the InputBar round-trips the original message in a `context` field so the model can answer the follow-up coherently.
- Settings are history-aware: each row carries an `effective_from` date, so changing the monthly budget in June doesn't retroactively change what May's budget was.

## Deploying

Vercel deployment requires swapping the SQLite layer for a managed Postgres (Neon, Supabase). The `lib/db.ts` abstraction makes this straightforward — function signatures stay identical, only the driver and a few SQL idioms (`datetime('now')` → `NOW()`, `strftime('%Y-%m', date)` → `TO_CHAR(date, 'YYYY-MM')`) need adjustment. `better-sqlite3` is auto-externalized by Next 16.
