# FinMate — Your AI Finance Friend

Tracking finances has always been harder than it should be. Expenses pile up, you lose track of who owes who, savings goals feel abstract, and by the end of the month you are left wondering where the money went. Most finance apps feel like spreadsheets with extra steps — full of forms, dropdowns, and categories that require you to already know what you are doing.

FinMate takes a different approach. Just type what happened — "spent $12 on lunch", "Tanvi owes me $35 for the train", "put $200 toward my car fund" — and the app figures out the rest. No forms. No dropdowns. No categories to pick. It understands plain English and turns it into structured financial data automatically.

The goal was simple: build something that feels less like a tool and more like a financially savvy friend who remembers everything, never judges, and occasionally reminds you when you are doing well.

![FinMate Demo](./public/demo.gif)

## What It Does

- **Understands plain English** — type expenses, income, money owed, goals, recurring bills, or budget changes in any phrasing you like
- **Tracks what matters** — net worth, spendable cash, goal progress, and budget usage all in one dashboard
- **Spots trends** — income vs expenses over time, top spending categories, and where your money actually goes
- **Keeps IOUs straight** — who owes you, who you owe, settle with one click and the app auto-categorizes the payment
- **Coaches you gently** — an AI finance coach reads your activity and sends short, specific nudges rather than generic advice
- **Respects your history** — change your budget in June and May data stays unchanged, always

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **SQLite** via `better-sqlite3`
- **Tailwind CSS** with colorblind-safe Okabe-Ito chart palette
- **Recharts** for trend lines, bar charts, and donut charts
- **Anthropic Claude API** — Haiku for fast input parsing, Sonnet for coaching

## Getting Started

1. Clone and install
```bash
git clone https://github.com/MonikaGundecha/finmate.git
cd finmate
npm install
```

2. Add your Anthropic API key
```bash
cp .env.example .env.local
```
Edit `.env.local` and paste your key from https://console.anthropic.com

3. Start the app
```bash
npm run dev
```
Open http://localhost:3000

4. Optional: load sample data
```bash
npx tsx scripts/seed.ts
```
This populates 5 months of realistic transactions, goals, recurring bills, and a monthly budget so the dashboard looks complete from day one. The script is safe to run multiple times — it skips itself if data already exists.

## Things You Can Type

- "spent $45 at Trader Joes"
- "got paid $4,200 salary"
- "Poorva owes me $20 for the train ticket"
- "paid back Tanvi"
- "save $10,000 for a car by next year"
- "put $500 toward car goal"
- "set my monthly budget to $2,000"
- "Netflix $16 monthly"
- "delete my duplicate car goal"
- "Lakshmi paid me back"

## How It Works Under the Hood

Every input goes to Claude Haiku, which extracts the type, amount, category, date, and any people involved — then saves it to a local SQLite database instantly.

For settlement phrases like "paid back Tanvi", a server-side pattern matcher handles the request directly without calling the AI at all. This makes it instant and completely reliable regardless of how the sentence is phrased.

The coaching system is designed to be cost-efficient. Instead of sending raw transaction history to Claude on every request — which would be slow and expensive — the app pre-computes a compact financial summary of around 300 tokens and sends only that. This keeps API costs well under a few dollars a month for regular daily use.

All money is stored as integer cents in the database and converted to dollars only at the display layer. This avoids floating point issues entirely.

Budget history is also preserved correctly. Each budget change is stored with an effective date, so changing your budget in June does not alter what May looked like. Every past period reflects the budget that was actually in place at the time.

## What Is Next

FinMate started as a personal project to solve a real problem. The foundation is solid and there is a clear path forward for making it more powerful and accessible to more people.

- **Mobile app** — the natural language input pattern works even better on mobile, where you can log expenses the moment they happen rather than trying to remember them later
- **Multi-user support with authentication** — proper login so multiple people can each have their own private financial data, securely separated
- **Bank and card sync** — connect real accounts via Plaid so manual entry becomes optional rather than required
- **Smarter AI coaching** — longer memory across sessions, personalized goal tracking, and proactive alerts before overspending happens rather than after
- **Cloud deployment** — the database abstraction layer is already built for migration to Postgres on Neon or Supabase, making Vercel deployment a straightforward next step
- **Shared and split expenses** — track group spending, split bills automatically, and manage shared financial commitments with friends or family

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `DATABASE_PATH` | Path to SQLite file (default: `./finance.db`) |

