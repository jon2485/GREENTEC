import { NextResponse } from 'next/server';
import { getCart, saveCart, sameLine } from '@/lib/cart';
import { db } from '@/lib/db';
import { priceOptions } from '@/lib/format';
import { parseVariants, resolveChoice } from '@/lib/variants';
import { availFor, stockMsg } from '@/lib/stock';

const count = (l: any[]) => l.reduce((a, x) => a + x.qty, 0);
export async function GET() { const l = await getCart(); return NextResponse.json({ lines: l, count: count(l) }); }
export async function POST(req: Request) {
  const { id, mode, qty = 1, set, v, pr } = await req.json();
  const p = await db.product.findUnique({ where: { id: +id } });
  if (!p || p.status !== 1) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const m = mode || 'physical';
  const vk = v ? String(v) : undefined; const prs = pr ? String(pr) : undefined;
  // products with sizes/colours/add-ons: a valid choice is required (same as the live site)
  if (m !== 'digital') {
    const vars = parseVariants(p.variantsJson);
    if (vars) {
      const o = priceOptions(p).find((x) => x.key === m) || priceOptions(p)[0];
      const ch = resolveChoice(vars, o?.price || 0, vk, prs);
      if (!ch) return NextResponse.json({ error: 'choose', message: 'יש לבחור ' + (vars.groups.map((g) => g.name).join(' / ') || 'אפשרות') }, { status: 400 });
      if (ch.stock === 0) return NextResponse.json({ error: 'stock', message: 'האפשרות שבחרת אזלה מהמלאי' }, { status: 409 });
    }
  }
  const lines = await getCart();
  const me = { id: p.id, mode: m, v: vk, pr: prs };
  const ex = lines.find((l) => sameLine(l, me));
  const q = Math.max(0, Math.min(99, Math.floor(+qty || 1)));
  // stock: a sold-out item (quantity 0) can't be added; no quantity = unlimited, quantity > 0 = in stock
  {
    const vars = parseVariants(p.variantsJson); const hasG = !!vars?.groups.length;
    const o = priceOptions(p).find((x) => x.key === m) || priceOptions(p)[0];
    const ch = m === 'digital' ? null : resolveChoice(vars, o?.price || 0, vk, prs);
    const avail = availFor(p, m, ch?.stock ?? null, hasG);
    if (avail === 0 && q > 0) return NextResponse.json({ error: 'stock', message: stockMsg(0) }, { status: 409 });
  }
  if (ex) ex.qty = set ? q : Math.min(99, ex.qty + q); else if (q) lines.push({ id: p.id, mode: m, qty: q, ...(vk ? { v: vk } : {}), ...(prs ? { pr: prs } : {}) });
  const next = m === 'digital' ? lines.map((l) => (l.id === p.id && l.mode === 'digital' ? { ...l, qty: 1 } : l)) : lines;
  const clean = next.filter((l) => l.qty > 0);
  await saveCart(clean); return NextResponse.json({ count: count(clean) });
}
export async function DELETE(req: Request) {
  const { id, mode, v, pr } = await req.json();
  const lines = (await getCart()).filter((l) => !sameLine(l, { id: +id, mode, v: v || undefined, pr: pr || undefined }));
  await saveCart(lines); return NextResponse.json({ count: count(lines) });
}
