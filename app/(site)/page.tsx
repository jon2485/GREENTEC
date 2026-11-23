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
  html = keep('{{ARTICLES}}', articles, articleCell, html);
  html = html.replace(/\{\{\w+\}\}/g, '');
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {T.homeScripts.map((s, i) => <script key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
    </>
  );
}
