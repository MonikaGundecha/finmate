import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || undefined;
    const category = searchParams.get('category') || undefined;
    const transactions = await getTransactions({ month, category });
    return NextResponse.json({ transactions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
