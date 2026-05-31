# FinMate

I built FinMate because I kept abandoning every finance app I tried. They all wanted me to fill out forms, pick categories, and remember to log things — which I never did consistently.

So I built something where you just type what happened. "Spent $45 at Trader Joes." "Tanvi owes me $30 for dinner." "Paid Netflix." The app figures out the rest.

**Live demo:** https://finmate-pearl.vercel.app

![FinMate Demo](./public/Demo.gif)

---

## What it does

- Log expenses, income, debts, and goals in plain English — no forms, no dropdowns
- Dashboard shows net worth, spendable cash, goal progress, and budget in one place
- Tracks who owes you and who you owe, nets them per person, settle with one click
- Manages subscriptions — say "paid Netflix" and it logs the payment and updates the next due date automatically
- After every transaction, an AI coach reads your spending and gives a short specific nudge (not generic advice)
- Budget history is preserved — changing your budget in June doesn't mess up what May looked like

## Tech stack

- **Next.js 14** + TypeScript — full stack in one project
- **PostgreSQL** on Neon — serverless cloud database
- **Tailwind CSS** + Recharts
- **Claude Haiku** — parses and categorizes every input
- **Claude Sonnet** — generates the coaching messages
- **Vercel** — auto-deploys on every push to main

## Running it locally

```bash
git clone https://github.com/MonikaGundecha/finmate.git
cd finmate
npm install
```

Copy the env file and add your keys:
```bash
cp .env.example .env.local
```

ANTHROPIC_API_KEY=your_key_here
DATABASE_URL=your_postgres_connection_string

Start the app:
```bash
npm run dev
```

To load sample data (5 months of transactions, goals, bills):
```bash
npx tsx scripts/seed.ts
```

## Example inputs
spent $45 at Trader Joes
got paid $4,200 salary
Poorva owes me $20 for the train
paid back Tanvi
paid Netflix
cancel gym subscription
save $10,000 for a car by next year
put $500 toward car goal
set my monthly budget to $2,000


## How it actually works

When you type something, the app first checks if it matches a known pattern — "paid back [name]" or "paid [subscription]" — and handles it instantly without calling the AI. This makes the common stuff reliable regardless of how you phrase it.

For everything else, it calls Claude Haiku with a context block that includes your existing recurring bills, goals, and debts — so it knows to match "paid gym" to your existing $45 Gym entry rather than creating a new one.

All amounts are stored as integer cents in the database and converted to dollars at the display layer. Sounds minor but it avoids a lot of subtle floating point bugs.

The coaching runs in the background after each transaction — it sends Sonnet a ~300 token summary of your finances rather than the full transaction history, which keeps it fast and cheap.

## What's next

- Mobile app — this input pattern works really well on mobile
- Auth + multi-user support
- Plaid integration for automatic bank sync
- Shared expense tracking

## Env variables

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DATABASE_URL` | Postgres connection string |


To paste it on GitHub directly:

Go to github.com/MonikaGundecha/finmate
Click on README.md
Click the pencil icon (Edit)
Select all and paste
Click Commit changes
