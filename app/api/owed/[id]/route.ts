import { NextResponse } from 'next/server';
import { anthropic, HAIKU_MODEL } from '@/lib/anthropic';
import { getOwedById, settleOwed, insertTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = [
  'Groceries',
  'Dining',
  'Personal Care',
  'Health',
  'Housing',
  'Utilities',
  'Shopping',
  'Transport',
  'Entertainment',
  'Travel',
  'Subscriptions',
  'Education',
  'Insurance',
  'Investment',
  'Debt Payment',
  'Other',
];

interface SettleBody {
  confirmed_category?: string;
}

async function recordSettlementTransaction(
  item: { amount: number; person: string; reason?: string | null },
  category: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  await insertTransaction({
    date: today,
    description: `Settled: ${item.reason || item.person}`,
    amount: item.amount,
    type: 'expense',
    category,
    subcategory: null,
    merchant: item.person,
    notes: 'Auto-logged from debt settlement',
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);

    const item = await getOwedById(id);
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body: SettleBody = await req.json().catch(() => ({} as SettleBody));

    // Two-step settle: explicit category confirmation
    if (body.confirmed_category) {
      await settleOwed(id);
      if (item.direction === 'i_owe') {
        await recordSettlementTransaction(item, body.confirmed_category);
      }
      return NextResponse.json({ success: true, category: body.confirmed_category });
    }

    // they_owe = repayment to user; settle without recording an expense
    if (item.direction === 'they_owe') {
      await settleOwed(id);
      return NextResponse.json({ success: true, category: null });
    }

    // i_owe — try Haiku auto-categorization
    try {
      const response = await anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Classify this payment into ONE category from this list: ${CATEGORIES.join(', ')}.
Payment reason: "${item.reason || ''}", Person: "${item.person}"
Respond with ONLY a JSON object: { "category": "...", "confident": true|false }
If the reason is vague, missing, or could plausibly fit multiple categories, set confident to false.`,
          },
        ],
      });

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean) as { category?: string; confident?: boolean };

      const suggested =
        result.category && CATEGORIES.includes(result.category) ? result.category : 'Other';

      if (result.confident && CATEGORIES.includes(suggested)) {
        await settleOwed(id);
        await recordSettlementTransaction(item, suggested);
        return NextResponse.json({ success: true, category: suggested });
      }

      return NextResponse.json({
        success: false,
        needs_confirmation: true,
        suggested_category: suggested,
        categories: CATEGORIES,
      });
    } catch (err) {
      console.error('Haiku categorization failed:', err);
      // Fall back: settle and record under Debt Payment so the transaction isn't lost
      await settleOwed(id);
      await recordSettlementTransaction(item, 'Debt Payment');
      return NextResponse.json({ success: true, category: 'Debt Payment', fallback: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
