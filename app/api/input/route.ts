import { NextRequest, NextResponse } from 'next/server';
import { anthropic, HAIKU_MODEL, CATEGORIZER_SYSTEM_PROMPT } from '@/lib/anthropic';
import {
  insertTransaction,
  insertOwed,
  insertRecurring,
  insertGoal,
  updateGoalProgress,
  deleteGoal,
  deleteTransaction,
  findGoalsByHint,
  findTransactionsByHint,
  advanceRecurringDue,
  deactivateRecurring,
  getRecurringById,
  getRecurring,
  getGoals,
  getOwed,
  settleOwed,
  setSetting,
  getMonthlyBudget,
  Transaction,
  Owed,
  Recurring,
  Goal,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ClarifyContext {
  question: string;
  original: string;
}

interface GoalContributionPayload {
  goal_hint: string;
  amount: number;
  date?: string;
}

interface DeleteGoalPayload {
  goal_hint: string;
}

interface DeleteTransactionPayload {
  description_hint: string;
}

interface SetBudgetPayload {
  amount: number;
}

interface SettleOwedPayload {
  person?: string;
  description?: string;
  amount?: number;
  date?: string;
}

interface RecurringPaymentPayload {
  recurring_id?: number;
  description?: string;
  date?: string;
}

interface CancelRecurringPayload {
  recurring_id?: number;
  description?: string;
}

type SaveType =
  | 'transaction'
  | 'owed'
  | 'recurring'
  | 'goal'
  | 'goal_contribution'
  | 'delete_goal'
  | 'delete_transaction'
  | 'set_budget'
  | 'settle_owed'
  | 'recurring_payment'
  | 'cancel_recurring';

interface ParsedSave {
  action: 'save';
  type: SaveType;
  data:
    | Transaction
    | Owed
    | Recurring
    | Goal
    | GoalContributionPayload
    | DeleteGoalPayload
    | DeleteTransactionPayload
    | SetBudgetPayload
    | SettleOwedPayload
    | RecurringPaymentPayload
    | CancelRecurringPayload;
}

interface ParsedClarify {
  action: 'clarify';
  question: string;
}

type Parsed = ParsedSave | ParsedClarify;

// Build a snapshot of existing recurring bills, goals, and unsettled debts
// to prepend to Haiku's system prompt. Haiku uses the ids to refer back when
// classifying recurring_payment, cancel_recurring, and settle actions.
async function buildInputContext(): Promise<string> {
  const recurring = await getRecurring(true);
  const goals = await getGoals();
  const owed = await getOwed(false);
  const lines: string[] = [];

  lines.push('EXISTING RECURRING BILLS:');
  if (recurring.length === 0) {
    lines.push('- (none)');
  } else {
    for (const r of recurring) {
      lines.push(
        `- ${r.name}, $${(r.amount / 100).toFixed(2)}/${r.frequency}, next due ${r.next_due}, id:${r.id}`,
      );
    }
  }

  lines.push('');
  lines.push('EXISTING GOALS:');
  if (goals.length === 0) {
    lines.push('- (none)');
  } else {
    for (const g of goals) {
      lines.push(
        `- ${g.name}, target $${(g.target_amount / 100).toFixed(2)}, saved $${((g.current_amount ?? 0) / 100).toFixed(2)}, id:${g.id}`,
      );
    }
  }

  lines.push('');
  lines.push('EXISTING UNSETTLED DEBTS:');
  if (owed.length === 0) {
    lines.push('- (none)');
  } else {
    for (const o of owed) {
      const reasonPart = o.reason ? ` for ${o.reason}` : '';
      if (o.direction === 'they_owe') {
        lines.push(`- ${o.person} owes you $${(o.amount / 100).toFixed(2)}${reasonPart}, id:${o.id}`);
      } else {
        lines.push(`- You owe ${o.person} $${(o.amount / 100).toFixed(2)}${reasonPart}, id:${o.id}`);
      }
    }
  }

  return lines.join('\n');
}

// Fire-and-forget: kick off coach-nudge generation after a transaction is saved.
// Coach insights are spending-focused, so we only trigger this on plain transaction
// saves — not goals, owed, budgets, etc. We deliberately do NOT await it so the save
// response returns immediately; failures are logged but never surfaced to the user.
//
// The URL must be absolute: on the server `fetch('/api/coach')` has no origin to
// resolve against. Prefer the deployment URL on Vercel, otherwise reuse the origin
// of the incoming request (covers localhost and any other host).
function triggerCoach(req: NextRequest): void {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : new URL(req.url).origin;
  void fetch(`${base}/api/coach`, { method: 'POST' }).catch(err => {
    console.error('Coach trigger failed:', err);
  });
}

// Fast-path: detect clearly settle-shaped inputs and skip Haiku entirely.
// Haiku is unreliable about settle_owed when amount/direction aren't stated, even with
// explicit prompt rules. These patterns are unambiguous enough to route directly.
// Returns the extracted person name, or null if no match.
function detectSettleIntent(msg: string): string | null {
  const trimmed = msg.trim();
  const patterns: RegExp[] = [
    /^paid\s+back\s+([A-Za-z][\w'-]*)\b/i,
    /^settled\s+(?:up\s+)?(?:with\s+)?([A-Za-z][\w'-]*)\b/i,
    /^squared\s+up\s+with\s+([A-Za-z][\w'-]*)\b/i,
    /^([A-Za-z][\w'-]*)\s+(?:paid|repaid)\s+me\s+back\b/i,
    /^([A-Za-z][\w'-]*)\s+and\s+i\s+are\s+(?:now\s+)?even\b/i,
    /^(?:we'?re|were)\s+even\s+with\s+([A-Za-z][\w'-]*)\b/i,
    /^no\s+longer\s+owe\s+([A-Za-z][\w'-]*)\b/i,
    /^got\s+my\s+money\s+back\s+from\s+([A-Za-z][\w'-]*)\b/i,
    /^([A-Za-z][\w'-]*)\s+is\s+settled\b/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { message?: string; context?: ClarifyContext };
    const { message, context } = body;
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Pre-flight: short-circuit clearly settle-shaped inputs.
    // Only on the first turn (no `context`), so we don't hijack clarification follow-ups.
    if (!context) {
      const personHint = detectSettleIntent(message);
      if (personHint) {
        const allOwed = await getOwed(false);
        const hint = personHint.toLowerCase();
        const matches = allOwed.filter(o => {
          const p = o.person.toLowerCase();
          return p.includes(hint) || hint.includes(p);
        });
        if (matches.length > 0) {
          const match =
            matches.find(o => o.direction === 'i_owe') ||
            matches.sort((a, b) => (a.id || 0) - (b.id || 0))[0];
          await settleOwed(match.id as number);
          if (match.direction === 'i_owe') {
            await insertTransaction({
              type: 'expense',
              amount: match.amount,
              category: 'Lending',
              description: `Settled: ${match.reason || match.person}`,
              merchant: match.person,
              date: today,
              subcategory: null,
              notes: 'Auto-logged from settle-owed pattern match',
            });
          }
          return NextResponse.json({
            action: 'saved',
            type: 'settle_owed',
            data: {
              settled: true,
              person: match.person,
              amount: match.amount,
              direction: match.direction,
            },
          });
        }
        // Pattern matched but no debt on file — fall through to Haiku so it can
        // either ask for clarification or interpret the input some other way.
      }
    }

    const userContent = context
      ? `Today's date: ${today}\nPrevious question: "${context.question}"\nUser's answer: "${message}"\nOriginal input: "${context.original}"`
      : `Today's date: ${today}\n${message}`;

    const dbContext = await buildInputContext();
    const fullSystem = `${dbContext}\n\n${CATEGORIZER_SYSTEM_PROMPT}`;

    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1000,
      system: fullSystem,
      messages: [{ role: 'user', content: userContent }],
    });

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    let parsed: Parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned) as Parsed;
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: rawText }, { status: 500 });
    }

    if (parsed.action === 'clarify') {
      return NextResponse.json({
        action: 'clarify',
        question: parsed.question,
        context: { question: parsed.question, original: context?.original || message },
      });
    }

    if (parsed.action === 'save') {
      const { type, data } = parsed;

      if (type === 'transaction') {
        const saved = await insertTransaction(data as Transaction);
        triggerCoach(req);
        return NextResponse.json({ action: 'saved', type, data: saved });
      }

      if (type === 'recurring_payment') {
        const payload = data as RecurringPaymentPayload;
        const recId = payload.recurring_id;
        if (!recId) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              logged: false,
              message: "I couldn't tell which recurring bill that was.",
            },
          });
        }
        const entry = await getRecurringById(recId);
        if (!entry) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              logged: false,
              message: 'That recurring bill no longer exists.',
            },
          });
        }
        await insertTransaction({
          type: 'expense',
          amount: entry.amount,
          category: entry.category,
          description: `${entry.name} payment`,
          merchant: entry.name,
          date: payload.date || today,
          subcategory: null,
          notes: 'Auto-logged from recurring_payment action',
        });
        const newDue = (await advanceRecurringDue(entry.id as number)) ?? entry.next_due;
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            logged: true,
            name: entry.name,
            amount: entry.amount,
            next_due: newDue,
          },
        });
      }

      if (type === 'cancel_recurring') {
        const payload = data as CancelRecurringPayload;
        const recId = payload.recurring_id;
        if (!recId) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              cancelled: false,
              message: "I couldn't tell which subscription to cancel.",
            },
          });
        }
        const entry = await getRecurringById(recId);
        if (!entry) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              cancelled: false,
              message: "That subscription doesn't exist or was already cancelled.",
            },
          });
        }
        await deactivateRecurring(recId);
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            cancelled: true,
            name: entry.name,
          },
        });
      }
      if (type === 'owed') {
        const saved = await insertOwed(data as Owed);
        return NextResponse.json({ action: 'saved', type, data: saved });
      }
      if (type === 'recurring') {
        const saved = await insertRecurring(data as Recurring);
        return NextResponse.json({ action: 'saved', type, data: saved });
      }
      if (type === 'goal') {
        const saved = await insertGoal(data as Goal);
        return NextResponse.json({ action: 'saved', type, data: saved });
      }

      if (type === 'goal_contribution') {
        const payload = data as GoalContributionPayload;
        const matches = await findGoalsByHint(payload.goal_hint);
        if (matches.length === 0) {
          const goals = await getGoals();
          const list = goals.map(g => g.name).join(', ') || '(none)';
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              matched: false,
              message: `I couldn't find a goal matching "${payload.goal_hint}". Your goals: ${list}`,
            },
          });
        }
        // Pick most recent (highest id) when multiple match
        const matched = matches.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
        const newCurrent = (matched.current_amount || 0) + payload.amount;
        await updateGoalProgress(matched.id as number, newCurrent);
        // Record as expense for net worth tracking
        await insertTransaction({
          type: 'expense',
          amount: payload.amount,
          category: 'Savings',
          description: `Goal: ${matched.name}`,
          merchant: null,
          date: payload.date || today,
          subcategory: null,
          notes: null,
        });
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            matched: true,
            name: matched.name,
            amount: payload.amount,
            current_amount: newCurrent,
            target_amount: matched.target_amount,
          },
        });
      }

      if (type === 'delete_goal') {
        const payload = data as DeleteGoalPayload;
        const matches = await findGoalsByHint(payload.goal_hint);
        if (matches.length === 0) {
          const goals = await getGoals();
          const list = goals.map(g => g.name).join(', ') || '(none)';
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              deleted: false,
              message: `I couldn't find a goal matching "${payload.goal_hint}". Your goals: ${list}`,
            },
          });
        }
        // Delete most recently created (highest id) — handles "duplicate" case
        const toDelete = matches.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
        await deleteGoal(toDelete.id as number);
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            deleted: true,
            name: toDelete.name,
            remaining: matches.length - 1,
          },
        });
      }

      if (type === 'settle_owed') {
        const payload = data as SettleOwedPayload;
        const hint = (payload.person || payload.description || '').toLowerCase().trim();
        if (!hint) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              settled: false,
              message: `Who did you settle with? I couldn't make out the name.`,
            },
          });
        }
        const allOwed = await getOwed(false); // unsettled only
        const matches = allOwed.filter(o => {
          const p = o.person.toLowerCase();
          return p.includes(hint) || hint.includes(p);
        });
        if (matches.length === 0) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              settled: false,
              message: `I couldn't find an unsettled debt with "${payload.person || hint}". Check the Owed tab to see what's outstanding.`,
            },
          });
        }
        // If multiple matches, prefer the i_owe one (paying back is the typical phrasing)
        // then fall back to oldest unsettled.
        const match =
          matches.find(o => o.direction === 'i_owe') ||
          matches.sort((a, b) => (a.id || 0) - (b.id || 0))[0];
        await settleOwed(match.id as number);

        // Only log a transaction when WE paid (i_owe). For they_owe, the user got money back —
        // settling alone is enough.
        if (match.direction === 'i_owe') {
          await insertTransaction({
            type: 'expense',
            amount: match.amount,
            category: 'Lending',
            description: `Settled: ${match.reason || match.person}`,
            merchant: match.person,
            date: payload.date || today,
            subcategory: null,
            notes: 'Auto-logged from settle-owed input',
          });
        }
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            settled: true,
            person: match.person,
            amount: match.amount,
            direction: match.direction,
          },
        });
      }

      if (type === 'set_budget') {
        const payload = data as SetBudgetPayload;
        const amount = Math.round(payload.amount || 0);
        const now = new Date();
        const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
          .toISOString()
          .slice(0, 10);
        await setSetting('monthly_budget', String(amount), firstOfNextMonth);
        // If no existing budget, also set effective today so the current period reflects it.
        const existing = await getMonthlyBudget();
        if (!existing) {
          await setSetting('monthly_budget', String(amount), new Date().toISOString().slice(0, 10));
        }
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            amount,
            effective_from: firstOfNextMonth,
            applies_now: !existing,
          },
        });
      }

      if (type === 'delete_transaction') {
        const payload = data as DeleteTransactionPayload;
        const matches = await findTransactionsByHint(payload.description_hint);
        if (matches.length === 0) {
          return NextResponse.json({
            action: 'saved',
            type,
            data: {
              deleted: false,
              message: `I couldn't find a recent transaction matching "${payload.description_hint}".`,
            },
          });
        }
        const toDelete = matches[0]; // already ordered by created_at DESC
        await deleteTransaction(toDelete.id as number);
        return NextResponse.json({
          action: 'saved',
          type,
          data: {
            deleted: true,
            description: toDelete.description,
            amount: toDelete.amount,
          },
        });
      }

      return NextResponse.json({ error: 'Unknown save type' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Unexpected AI response' }, { status: 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('Input API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
