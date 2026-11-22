import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser, ADMIN_TYPES } from '@/lib/auth';
import { canDownload } from '@/lib/downloads';
import { signedDownload, storageReady } from '@/lib/storage';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser(); const id = +(await params).id;
  if (!u) return NextResponse.redirect(new URL(`/login?next=/account?tab=downloads`, req.url));
  const p = await db.product.findUnique({ where: { id } });
  if (!p || !p.digitalFile) return new NextResponse('הקובץ עדיין לא הועלה למערכת', { status: 404 });
  if (!ADMIN_TYPES.includes(u.type) && !(await canDownload(u.id, id))) return new NextResponse('אין הרשאת הורדה למוצר זה', { status: 403 });
  if (!storageReady()) return new NextResponse('אחסון הקבצים לא הוגדר', { status: 503 });
  const ext = p.digitalFile.split('.').pop() || 'zip';
  const url = await signedDownload(p.digitalFile, `${p.name}.${ext}`);
  await db.downloadLog.create({ data: { userId: u.id, productId: id, ip: req.headers.get('x-forwarded-for') || '' } });
  return NextResponse.redirect(url, 302);
}
