import { db } from '@/lib/db';
import { T } from '@/lib/tpl';
import { latestIn } from '@/lib/catalog';
import { albumCard, movieTile, carouselCell, articleCell } from '@/lib/render';
import { getHomeDesign, applySection, heroCells } from '@/lib/homeDesign';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גרינטק – מוזיקה יהודית, סרטים, יודאיקה ותוכן יהודי', alternates: { canonical: '/' } };

export default async function Home() {
  const design = await getHomeDesign();
  const fns: Record<string, (x: any) => string> = { MUSIC: albumCard, MOVIES: movieTile, JUDAICA: carouselCell, GAMES: carouselCell, ACCESSORIES: carouselCell };
  const [lists, articles] = await Promise.all([
    Promise.all(design.sections.map((s) => (s.enabled === false || !s.categoryIds.length ? Promise.resolve([]) : latestIn(s.categoryIds, s.count)))),
    db.article.findMany({ where: { status: true }, orderBy: { id: 'desc' }, take: 6 }),
  ]);
  const keep = (tok: string, arr: any[], fn: (x: any) => string, html: string) => (arr.length ? html.replace(tok, arr.map(fn).join('')) : html);
  let html = T.home;
  if (design.heroAlbum) {
    const cells = await heroCells(design.heroAlbum, design.heroButton);
    const a = html.indexOf('<!-- Hero Section Start -->'), b = html.indexOf('<!-- Hero Section End -->');
    if (cells && a >= 0 && b > a) {
      const seg = html.slice(a, b); const open = seg.indexOf('>', seg.indexOf('main-carousel hero-carousel')) + 1; const close = seg.lastIndexOf('</div>');
      html = html.slice(0, a) + seg.slice(0, open) + cells + seg.slice(close) + html.slice(b);
    }
  }
  // A section with no products marked "הצג בדף הבית" is hidden entirely (never filled with other products)
  const SECTION: Record<string, string> = { MUSIC: 'Jewish music', MOVIES: 'Movies', JUDAICA: 'Judaica', GAMES: 'Games', ACCESSORIES: 'Accessories' };
  design.sections.forEach((s, i) => {
    if (!lists[i].length) {
      const a = html.indexOf(`<!-- ${SECTION[s.token]} Section Start -->`), b = html.indexOf(`<!-- ${SECTION[s.token]} Section End -->`);
      if (a >= 0 && b > a) { html = html.slice(0, a) + html.slice(b); return; }
    }
    html = applySection(html, s); html = keep(`{{${s.token}}}`, lists[i], fns[s.token], html);
  });
  // Template demo sections that are not real store data → removed (the homepage shows only real, "הצג בדף הבית" products)
  // "חדש באתר" = the live site's 3 USB-collection boxes, each linking to its category (template look, live links)
  {
    const a = html.indexOf('<!-- New on the site Section Start -->'), b = html.indexOf('<!-- New on the site Section End -->');
    if (a >= 0 && b > a) {
      let sec = html.slice(a, b);
      const links = ['/מוזיקה-ב-usb', '/שמע-לילדים-usb', '/dvd-usb'];
      links.forEach((href, i) => {
        sec = sec.replace(new RegExp(`<div class="item-box group i-${i + 1}">([\\s\\S]*?)</div>`), `<a href="${encodeURI(href)}" class="item-box group i-${i + 1}">$1</a>`);
      });
      sec = sec.replace(/<div class="d-flex justify-content-center">\s*<a href="\/search\?sort=new"[\s\S]*?<\/div>/, '');
      html = html.slice(0, a) + sec + html.slice(b);
    }
  }
  for (const name of ['New singles']) {
    const a = html.indexOf(`<!-- ${name} Section Start -->`), b = html.indexOf(`<!-- ${name} Section End -->`);
    if (a >= 0 && b > a) html = html.slice(0, a) + html.slice(b);
  }
  html = keep('{{ARTICLES}}', articles, articleCell, html);
  html = html.replace(/\{\{\w+\}\}/g, '');
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {T.homeScripts.map((s, i) => <script key={i} dangerouslySetInnerHTML={{ __html: s.replace('const sc=Math.max(W/IW,H/IH)', "const sc=(getComputedStyle(img).objectFit==='contain'?Math.min:Math.max)(W/IW,H/IH)").replace('oy=(H-rh)*0.5', "oy=(H-rh)*((parseFloat(getComputedStyle(img).objectPosition.split(' ')[1]) || 50) / 100)") }} />)}
    </>
  );
}
