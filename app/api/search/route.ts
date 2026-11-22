import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enc } from '@/lib/format';
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ items: [] });
  const rows = await db.product.findMany({ where: { status: 1, OR: [{ name: { contains: q, mode: 'insensitive' } }, { searchText: { contains: q, mode: 'insensitive' } }] }, take: 8, orderBy: { id: 'desc' }, select: { name: true, urlPath: true, categories: { where: { primary: true }, select: { category: { select: { name: true } } } } } });
  db.searchLog.create({ data: { term: q.slice(0, 120) } }).catch(() => {});
  return NextResponse.json({ items: rows.map((r) => ({ name: r.name, href: enc(r.urlPath), category: r.categories[0]?.category.name || '' })) });
}
