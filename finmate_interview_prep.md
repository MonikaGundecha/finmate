# FinMate — Interview Preparation Guide
### AI-Powered Personal Finance Manager

---

## 1. PROJECT OVERVIEW (30-second pitch)

**What is it?**
FinMate is a local-first personal finance web app where you manage your money through natural language. Instead of forms and dropdowns, you just type "spent $45 at Trader Joes" or "I owe Poorva $30 for dinner" and the app understands, categorizes, and stores it. It shows a live dashboard with spending charts, savings goals, recurring bills, and an AI coach that gives personalized nudges.

**Why did you build it?**
The hardest part of personal finance isn't understanding money — it's the friction of recording it consistently. I wanted to remove that friction entirely using AI.

**Live URL:** finmate-pearl.vercel.app
**GitHub:** github.com/MonikaGundecha/finmate

---

## 2. TECH STACK (and why each choice)

| Technology | Why |
|-----------|-----|
| Next.js 14 (App Router) | Full-stack in one project — frontend + API routes together, no separate backend |
| TypeScript | End-to-end type safety from DB layer through API to UI components |
| PostgreSQL (Neon) | Cloud-hosted, free tier, scales to zero when inactive — perfect for portfolio |
| Tailwind CSS | Rapid UI development with consistent design system |
| Recharts | Composable chart library for React — line, bar, donut charts |
| Claude Haiku | Fast, cheap AI for input parsing and categorization |
| Claude Sonnet | Smarter AI for personalized coaching messages |
| Vercel | Zero-config deployment, auto-deploys on every GitHub push (CI/CD) |

---

## 3. ARCHITECTURE (how it all connects)

```
User types input
      ↓
InputBar (React component)
      ↓
POST /api/input (Next.js API route)
      ↓
Fast-path check (regex for known patterns)
      ↓ (if no match)
Claude Haiku (parses + categorizes)
      ↓
lib/db.ts (database abstraction layer)
      ↓
PostgreSQL on Neon (cloud database)
      ↓
Dashboard refreshes → all KPIs + charts update
      ↓ (background)
Claude Sonnet (generates coaching nudge)
```

**Key architectural decision:** All database calls go through a single abstraction layer (`lib/db.ts`). This meant migrating from SQLite to PostgreSQL only required changing one file — all API routes and components stayed identical.

---

## 4. AI SYSTEM DESIGN

### Two models, two purposes
- **Claude Haiku** — input parser. Fast and cheap. Converts "spent $45 at Trader Joes" into structured JSON: `{ type: "expense", amount: 4500, category: "Groceries", merchant: "Trader Joes" }`
- **Claude Sonnet** — finance coach. Smarter and warmer. Reads a compact financial summary and generates 1-2 sentence nudges like "You're at 85% of your dining budget — watch the next few days."

### The Smart Context Pattern
Claude never receives raw transaction history (that would be slow and expensive). Instead, the app pre-computes a compact ~300 token summary before every coaching call:
- This month's totals by category
- Goals progress
- Outstanding owed amounts
- Upcoming recurring bills
- Last 5 coach messages (to avoid repetition)

### DB Context Injection (key fix)
Early version: Haiku had no idea what was already in the database. If you said "paid gym", it would ask for the amount instead of looking up the existing $45 Gym recurring entry.

Fix: Before every Haiku call, inject a context block listing all existing recurring bills, goals, and owed entries. Now Haiku can match "paid gym" to the existing entry and use the correct amount automatically.

### Fast-path Pattern
Some inputs are too simple to waste an API call on. A deterministic regex fast-path handles:
- Settle phrases: "paid back Tanvi", "settled with Poorva" → instantly settles the right debt
- Recurring payments: "paid Netflix", "paid gym" → matches existing recurring entry, uses stored amount, advances due date

---

## 5. DATABASE DESIGN

**Key decision: store amounts in cents (integers), not dollars (floats)**
- 0.1 + 0.2 = 0.30000000000000004 in JavaScript
- 1250 + 450 = 1700 in integer arithmetic — always exact
- Divide by 100 only at the display layer

**6 tables:**
- `transactions` — expenses and income
- `owed` — money owed in both directions
- `recurring` — subscription and bill tracking
- `goals` — savings goals with progress
- `settings` — budget history with effective dates (changing budget doesn't overwrite history)
- `coach_log` — AI coaching messages

**Budget history design:**
Instead of storing `budget = 2000` as a single value, each change creates a new row with an `effective_from` date. So `getSetting("monthly_budget", "2026-05-01")` always returns what was actually in effect on that date. Past months stay accurate.

---

## 6. PROBLEMS FACED AND HOW YOU SOLVED THEM

### Problem 1: AI parsing was unreliable
**Issue:** Haiku would ask for clarification even on clear inputs like "paid back Tanvi". Three rounds of prompt engineering didn't fix it.

**Solution:** Built a deterministic regex fast-path that bypasses Haiku entirely for known patterns. Reliable, instant, free. AI used only as fallback for genuinely ambiguous inputs.

**Interview talking point:** Sometimes the right answer is NOT more AI — a simple regex is more reliable than prompting a model harder.

---

### Problem 2: One-way AI connection
**Issue:** Haiku parsed inputs fine but had no awareness of existing database state. Saying "paid gym" created a new entry instead of matching the existing $45 Gym subscription.

**Solution:** Before every Haiku API call, build a context string from the database (existing recurring bills, goals, owed entries) and inject it into the system prompt. Haiku can now match against real data.

**Interview talking point:** AI models have no memory between calls. You have to give them the context they need every single time.

---

### Problem 3: SQLite works locally but not on Vercel
**Issue:** SQLite uses a local file (`finance.db`). Vercel is serverless — no persistent file system between requests.

**Solution:** Migrated database layer from SQLite (better-sqlite3, synchronous) to PostgreSQL (pg library, async/await). Because all DB calls were abstracted behind `lib/db.ts`, only that one file needed changing. All 9 API routes needed await keywords added.

**Interview talking point:** Database abstraction layers aren't just good practice — they made a major infrastructure migration a surgical change instead of a rewrite.

---

### Problem 4: Recurring payment detection
**Issue:** Saying "paid spotify subscription" would ask for amount and create a new entry instead of using the stored $10 and advancing the due date.

**Solution:** Added a `detectRecurringPayment()` fast-path that checks input for trigger words (paid, paying, renewed) + a matching recurring bill name. On match: uses stored amount, logs transaction, advances `next_due` by the correct interval (monthly/weekly/yearly).

---

### Problem 5: Owed ledger showing duplicate entries per person
**Issue:** If Red owes you $50 and you owe Red $23, the ledger showed two separate entries instead of netting them.

**Solution:** Group entries by person name, calculate net per person (theyOweTotal - iOweTotal), display one row per person with a details toggle to see individual entries.

---

### Problem 6: Wrong settle direction
**Issue:** "Red paid me back" was settling your debt to Red instead of Red's debt to you.

**Solution:** Updated Haiku system prompt with explicit direction rules: "Red paid me back" = settle `they_owe` direction. "I paid Red back" = settle `i_owe` direction.

---

### Problem 7: Coach showing wrong currency (₹ instead of $)
**Issue:** After deploying to Vercel with fresh seed data, Claude Sonnet started using ₹ based on IP/account location inference.

**Solution:** Added explicit instruction at top of coach system prompt: "Always use USD ($) for all monetary amounts. Never use ₹, INR, or any other currency."

---

### Problem 8: Transaction history not updating
**Issue:** After logging a new entry, the dashboard KPIs refreshed but the transaction history table didn't.

**Solution:** Added a `refreshTrigger` prop (incrementing number) to TransactionHistory. When `onSaved` fires in page.tsx, increment the trigger. TransactionHistory's useEffect depends on it and re-fetches.

---

## 7. DEPLOYMENT JOURNEY

### Local development (Phase 1)
- Next.js dev server + SQLite file on local machine
- `npm run dev` → localhost:3000

### GitHub (Phase 2)
- `.gitignore` excludes `finance.db` and `.env.local` (API key + DB credentials never committed)
- Pushed all changes to `github.com/MonikaGundecha/finmate`

### Database migration (Phase 3)
- Created free PostgreSQL database on Neon (neon.tech)
- Rewrote `lib/db.ts` from better-sqlite3 (sync) to pg (async)
- SQL syntax changes: `?` → `$1,$2`, `datetime('now')` → `NOW()`, `strftime` → `TO_CHAR`
- Ran seed script against Neon to populate demo data
- All 9 API routes updated to use async/await

### Vercel deployment (Phase 4)
- Connected GitHub repo to Vercel
- Added `ANTHROPIC_API_KEY` and `DATABASE_URL` as environment variables
- Clicked Deploy → live in 2 minutes
- CI/CD: every `git push origin main` now auto-deploys

---

## 8. CI/CD EXPLANATION

**CI (Continuous Integration):** When you push code to GitHub, Vercel automatically checks and builds it.

**CD (Continuous Deployment):** If the build succeeds, it automatically deploys to production.

**Your workflow now:**
```bash
git add .
git commit -m "describe change"
git push origin main
# Vercel auto-deploys in ~2 minutes — no manual steps
```

---

## 9. WHAT YOU LEARNED

- **AI models are stateless** — you must inject all relevant context on every call
- **Deterministic beats probabilistic** for simple pattern matching — regex is more reliable than prompting
- **Abstraction layers pay off** — the DB abstraction made a major migration surgical
- **Cents not dollars** — integer arithmetic for money, always
- **Test before deploying** — many bugs only appear with real interaction patterns
- **Environment variables** — secrets never go in code or git, always in env vars

---

## 10. POTENTIAL INTERVIEW QUESTIONS + ANSWERS

**Q: Why did you use two different Claude models?**
A: Cost and capability tradeoff. Haiku is fast and cheap — perfect for parsing every user input. Sonnet is smarter and warmer — worth the extra cost for the coaching messages that need genuine insight. Using Sonnet for every input would cost 5x more.

**Q: How do you handle the AI making mistakes?**
A: Two ways. First, fast-path regex catches the most common patterns deterministically. Second, Haiku returns `needs_clarification` with quick-pick options when genuinely uncertain — the user picks rather than the AI guessing.

**Q: Why SQLite first, then Postgres?**
A: SQLite requires zero setup — great for local development. But it's a file on disk which doesn't work on serverless platforms like Vercel. Designing the DB abstraction layer from day one made the migration a single-file change.

**Q: What would you build next?**
A: Authentication with Clerk or NextAuth for multi-user support, then Plaid integration for automatic bank sync. The natural language input would become even more powerful with real transaction data to work with.

**Q: How did you keep costs low for the AI calls?**
A: The smart context pattern — Sonnet never sees raw transaction history. Instead it gets a pre-computed ~300 token summary. This keeps coaching calls fast and cheap regardless of how many transactions are in the database.

---

## 11. NUMBERS TO REMEMBER

- **6 database tables**
- **2 AI models** (Haiku + Sonnet)
- **9 API routes**
- **53 seed transactions** across 5 months
- **2 goals** (Car Fund $10k, Vacation Fund $3k)
- **5 recurring bills**
- **~300 tokens** max for coach context
- **100x** — amounts stored in cents (divide by 100 for display)

---

*Built by Monika Gundecha — May 2026*
