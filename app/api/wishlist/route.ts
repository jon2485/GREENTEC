import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return NextResponse.json({ error: 'login' }, { status: 401 });
  const { id } = await req.json(); const key = { userId_productId: { userId: u.id, productId: +id } };
  const ex = await db.wishlist.findUnique({ where: key });
  if (ex) await db.wishlist.delete({ where: key }); else await db.wishlist.create({ data: { userId: u.id, productId: +id } });
  return NextResponse.json({ on: !ex });
}
