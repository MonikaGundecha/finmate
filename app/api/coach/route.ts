import { NextResponse } from 'next/server';
import { anthropic, SONNET_MODEL, COACH_SYSTEM_PROMPT } from '@/lib/anthropic';
import { buildDBSummary } from '@/lib/summary';
import { insertCoachLog } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface Nudge {
  message: string;
  trigger: string;
}

export async function POST() {
  try {
    const summary = await buildDBSummary();

    const response = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1000,
      system: COACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(summary) }],
    });

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    let nudges: Nudge[];
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      nudges = JSON.parse(cleaned) as Nudge[];
    } catch {
      return NextResponse.json({ error: 'Failed to parse coach response', raw: rawText }, { status: 500 });
    }

    const saved = await Promise.all(
      nudges.map(n => insertCoachLog({ message: n.message, trigger: n.trigger, read: 0 })),
    );

    return NextResponse.json({ nudges: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('Coach API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
