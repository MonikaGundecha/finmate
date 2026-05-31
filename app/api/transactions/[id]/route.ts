import { NextRequest, NextResponse } from 'next/server';
import {
  deleteTransaction,
  updateTransaction,
  getTransactionById,
  findRecurringByName,
  reverseRecurringDue,
  Transaction,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = (await req.json()) as Partial<Transaction>;
    updateTransaction(parseInt(id, 10), updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const txId = parseInt(id, 10);
    const tx = getTransactionById(txId);
    if (tx) {
      const hints = [tx.description, tx.merchant].filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      for (const hint of hints) {
        const matches = findRecurringByName(hint);
        if (matches.length > 0 && matches[0].id !== undefined) {
          reverseRecurringDue(matches[0].id);
          break;
        }
      }
    }
    deleteTransaction(txId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
