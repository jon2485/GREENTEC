import { NextResponse } from 'next/server';
import { signedGet, storageReady } from '@/lib/storage';
// Public images uploaded from the admin (bucket keys under media/). Redirects to a short-lived signed URL.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = 'media/' + (await params).key.map(decodeURIComponent).join('/');
  if (key.includes('..') || !storageReady()) return new NextResponse('Not found', { status: 404 });
  const url = await signedGet(key, 6 * 3600);
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'public, max-age=3000' } });
}
