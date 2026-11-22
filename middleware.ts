import { NextResponse, type NextRequest } from 'next/server';
// Staging gate: HTTP basic auth on the whole site when STAGING_USER/STAGING_PASS are set.
export function middleware(req: NextRequest) {
  const u = process.env.STAGING_USER, p = process.env.STAGING_PASS;
  if (u && p && !req.nextUrl.pathname.startsWith('/api/health')) {
    const h = req.headers.get('authorization') || '';
    const ok = h.startsWith('Basic ') && atob(h.slice(6)) === `${u}:${p}`;
    if (!ok) return new NextResponse('Staging – authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="GREENTEC staging", charset="UTF-8"' } });
  }
  const res = NextResponse.next();
  if (process.env.STAGING === '1') res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
