import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getSettings } from '@/lib/settings';
import { parseScripts, trackingEnabled } from '@/lib/headerCodes';

const SITE = process.env.SITE_URL || 'https://www.greentec.co.il';
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'גרינטק – מוזיקה יהודית, סרטים ותוכן יהודי', template: '%s' },
  robots: process.env.STAGING === '1' ? { index: false, follow: false } : undefined,
  icons: { icon: '/t/assets/images/logo-v.png', apple: '/t/assets/images/logo.png' },
  applicationName: 'גרינטק',
  openGraph: { siteName: 'גרינטק', locale: 'he_IL', type: 'website' },
  formatDetection: { telephone: false },
};
export const viewport = { themeColor: '#161616', width: 'device-width', initialScale: 1 };

const V = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now())).slice(0, 8);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const st = trackingEnabled() ? await getSettings().catch(() => ({} as Record<string, string>)) : ({} as Record<string, string>);
  const codes = parseScripts(st.header_landing || '');
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Varela+Round&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/t/vendor/flickity.min.css" />
        <link rel="stylesheet" href="/t/vendor/flickity-fade.css" />
        <link rel="stylesheet" href="/t/vendor/bootstrap.rtl.min.css" />
        <link rel="stylesheet" href={"/t/assets/css/greenshow-topbar.css?v=" + V} />
        <link rel="stylesheet" href={"/t/assets/css/style.css?v=" + V} />
        <link rel="stylesheet" href={"/t/assets/css/gt-app.css?v=" + V} />
        <script src="/t/vendor/flickity.pkgd.min.js"></script>
        <script src="/t/vendor/flickity-fade.js"></script>
        {st.google_site_verification ? <meta name="google-site-verification" content={st.google_site_verification} /> : null}
        {codes.map((c, i) => (c.src ? <script key={i} src={c.src} async={c.async} /> : <script key={i} dangerouslySetInnerHTML={{ __html: c.code! }} />))}
      </head>
      <body>
        <div className="d-flex flex-column min-vh-100">
          <Header />
          {children}
          <Footer />
        </div>
        {/* overlays the template scripts build at load (quick view, GreenShow teaser) live here, outside React's tree */}
        <div id="gt-overlays" dangerouslySetInnerHTML={{ __html: '' }} />
        <script src="/t/vendor/jquery.min.js"></script>
        <script src="/t/vendor/bootstrap.bundle.min.js"></script>
        <script src={"/t/assets/js/main.js?v=" + V}></script>
        <script src={"/t/assets/js/quickview.js?v=" + V}></script>
        <script src={"/t/assets/js/greenshow-teaser.js?v=" + V}></script>
        <script src={"/t/assets/js/gt-site.js?v=" + V}></script>
      </body>
    </html>
  );
}
