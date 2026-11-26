import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getSettings } from '@/lib/settings';
import { parseScripts, trackingEnabled } from '@/lib/headerCodes';
import { parseGaEvents, GA_FIRE } from '@/lib/gaEvents';

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

// Start React's hydration only after the whole HTML document has been parsed (DOMContentLoaded).
// Next.js loads its chunks with async scripts; on a slow connection they run while the (large) page is still
// streaming in, React then hydrates a half-parsed <body>, throws error #418 and rebuilds the page on the client,
// which detaches everything the template scripts (Flickity, quick view, buttons) bound to. Chunks pushed before
// DOMContentLoaded are held and handed to the webpack runtime afterwards. If anything here is unexpected the
// page keeps working as server HTML + template scripts.
const HYDRATION_GATE = `(function(){try{var d=document;if(d.readyState!=='loading')return;var a=self.webpackChunk_N_E=self.webpackChunk_N_E||[];
var held=[],rt=Object.prototype.hasOwnProperty.call(a,'push')?a.push:null,open=false,depth=0,ap=Array.prototype.push;
function run(c){depth++;try{rt(c)}finally{depth--}}
function flush(){if(!open||!rt)return;var h=held;held=[];for(var i=0;i<h.length;i++)run(h[i])}
function q(){if(depth>0)return ap.apply(a,arguments);for(var i=0;i<arguments.length;i++){if(open&&rt)run(arguments[i]);else held.push(arguments[i])}return a.length}
Object.defineProperty(a,'push',{configurable:true,get:function(){return q},set:function(f){rt=f;flush()}});
d.addEventListener('DOMContentLoaded',function(){open=true;flush()})}catch(e){}})();`;

// Second half of the gate, independent of script order: Next streams the page data (RSC payload) through
// self.__next_f in inline scripts in <body>, after this <head> script has run. Holding that data until
// DOMContentLoaded keeps React from hydrating before the whole page is parsed, even when a cached chunk ran
// before the webpack gate above could be installed.
const FLIGHT_GATE = `(function(){try{var d=document;if(d.readyState!=='loading'||self.__next_f)return;var held=[],cb=null,open=false,arr=[];
function flush(){if(!open||!cb)return;var h=held;held=[];for(var i=0;i<h.length;i++)cb(h[i])}
Object.defineProperty(arr,'push',{configurable:true,get:function(){return function(){for(var i=0;i<arguments.length;i++){if(open&&cb)cb(arguments[i]);else held.push(arguments[i])}return held.length}},set:function(f){cb=f;flush()}});
self.__next_f=arr;d.addEventListener('DOMContentLoaded',function(){open=true;flush()})}catch(e){}})();`;
const V = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now())).slice(0, 8);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const st = trackingEnabled() ? await getSettings().catch(() => ({} as Record<string, string>)) : ({} as Record<string, string>);
  const codes = parseScripts(st.header_landing || '');
  const gaCart = parseGaEvents(st.ga_events).filter((e) => e.type === 'cart');
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FLIGHT_GATE + HYDRATION_GATE }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Varela+Round&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/t/vendor/flickity.min.css" />
        <link rel="stylesheet" href="/t/vendor/flickity-fade.css" />
        <link rel="stylesheet" href="/t/vendor/bootstrap.rtl.min.css" />
        <link rel="stylesheet" href={"/t/assets/css/greenshow-topbar.css?v=" + V} />
        <link rel="stylesheet" href={"/t/assets/css/style.css?v=" + V} />
        <link rel="stylesheet" href={"/t/assets/css/gt-app.css?v=" + V} />
        <script src="/t/vendor/flickity.pkgd.min.js" defer></script>
        <script src="/t/vendor/flickity-fade.js" defer></script>
        {st.google_site_verification ? <meta name="google-site-verification" content={st.google_site_verification} /> : null}
        {gaCart.length ? <script dangerouslySetInnerHTML={{ __html: `window.GT_GA_CART=${JSON.stringify(gaCart).replace(/</g, '\\u003c')};window.GT_GA_FIRE=${GA_FIRE};` }} /> : null}
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
        {/* defer: a blocking script here pauses the HTML parser in the middle of React's tree; under load React then starts
            hydrating a half-parsed <body> and throws away the server HTML (React error #418). Deferred scripts keep their order. */}
        <script src="/t/vendor/jquery.min.js" defer></script>
        <script src="/t/vendor/bootstrap.bundle.min.js" defer></script>
        <script src={"/t/assets/js/main.js?v=" + V} defer></script>
        <script src={"/t/assets/js/quickview.js?v=" + V} defer></script>
        <script src={"/t/assets/js/greenshow-teaser.js?v=" + V} defer></script>
        <script src={"/t/assets/js/gt-site.js?v=" + V} defer></script>
      </body>
    </html>
  );
}
