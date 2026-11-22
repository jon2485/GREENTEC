import { NextResponse } from 'next/server';
import { getCart, saveCart } from '@/lib/cart';
import { db } from '@/lib/db';

const count = (l: any[]) => l.reduce((a, x) => a + x.qty, 0);
export async function GET() { const l = await getCart(); return NextResponse.json({ lines: l, count: count(l) }); }
export async function POST(req: Request) {
  const { id, mode, qty = 1, set } = await req.json();
  const p = await db.product.findUnique({ where: { id: +id }, select: { id: true, status: true } });
  if (!p || p.status !== 1) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const lines = await getCart(); const m = mode || 'physical';
  const ex = lines.find((l) => l.id === p.id && l.mode === m);
  const q = Math.max(0, Math.min(99, Math.floor(+qty || 1)));
  if (ex) ex.qty = set ? q : Math.min(99, ex.qty + q); else if (q) lines.push({ id: p.id, mode: m, qty: q });
  const next = m === 'digital' ? lines.map((l) => (l.id === p.id && l.mode === 'digital' ? { ...l, qty: 1 } : l)) : lines;
  const clean = next.filter((l) => l.qty > 0);
  await saveCart(clean); return NextResponse.json({ count: count(clean) });
}
export async function DELETE(req: Request) {
  const { id, mode } = await req.json();
  const lines = (await getCart()).filter((l) => !(l.id === +id && l.mode === mode));
  await saveCart(lines); return NextResponse.json({ count: count(lines) });
}
