import { NextResponse, type NextRequest } from 'next/server';
// Staging gate: HTTP basic auth on the whole site when STAGING_USER/STAGING_PASS are set.
export function middleware(req: NextRequest) {
  const u = process.env.STAGING_USER, p = process.env.STAGING_PASS;
  // /api/migrate/* is called cross-origin from the legacy site during the file migration; it has its own token.
  // Showcase link for a prospective supplier: only /preview/<SHOWCASE_TOKEN> (the home page) plus the public template/media assets it needs.
  const path = req.nextUrl.pathname; const ST = process.env.SHOWCASE_TOKEN || '';
  const showcase = ST.length >= 24 && (path === `/preview/${ST}` || path === `/preview/${ST}/` || ((req.method === 'GET' || req.method === 'HEAD') && (path.startsWith('/t/') || path.startsWith('/media/'))));
  if (u && p && !showcase && !path.startsWith('/api/health') && !path.startsWith('/api/migrate/')) {
    const h = req.headers.get('authorization') || '';
    const ok = h.startsWith('Basic ') && atob(h.slice(6)) === `${u}:${p}`;
    // background fetch/XHR calls get a plain 401 (no login popup over the showcase page)
    const hdr: Record<string, string> = req.headers.get('sec-fetch-dest') === 'empty' ? {} : { 'WWW-Authenticate': 'Basic realm="GREENTEC staging", charset="UTF-8"' };
    if (!ok) return new NextResponse('Staging – authentication required', { status: 401, headers: hdr });
  }
  // production: one host only – greentec.co.il → https://www.greentec.co.il (same path), so Google sees one copy of each page
  if (process.env.STAGING !== '1') {
    const host = (req.headers.get('host') || '').toLowerCase();
    if (host === 'greentec.co.il') { const u = req.nextUrl.clone(); u.host = 'www.greentec.co.il'; u.protocol = 'https'; u.port = ''; return NextResponse.redirect(u, 301); }
  }
  const res = NextResponse.next();
  if (process.env.STAGING === '1') res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
