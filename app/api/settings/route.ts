import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = getAllSettings();
    return NextResponse.json(settings);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const updates = (await req.json()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      setSetting(key, String(value));
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
