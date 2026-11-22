import { db } from '@/lib/db';
import { T } from '@/lib/tpl';
import { latestIn } from '@/lib/catalog';
import { albumCard, movieTile, carouselCell, articleCell } from '@/lib/render';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גרינטק – מוזיקה יהודית, סרטים, יודאיקה ותוכן יהודי', alternates: { canonical: '/' } };

export default async function Home() {
  const [music, movies, judaica, games, acc, articles] = await Promise.all([
    latestIn([56], 8), latestIn([79], 8), latestIn([80, 177], 10), latestIn([351, 352], 10), latestIn([81], 10),
    db.article.findMany({ where: { status: true }, orderBy: { id: 'desc' }, take: 6 }),
  ]);
  const keep = (tok: string, arr: any[], fn: (x: any) => string, html: string) => (arr.length ? html.replace(tok, arr.map(fn).join('')) : html);
  let html = T.home;
  html = keep('{{MUSIC}}', music, albumCard, html);
  html = keep('{{MOVIES}}', movies, movieTile, html);
  html = keep('{{JUDAICA}}', judaica, carouselCell, html);
  html = keep('{{GAMES}}', games, carouselCell, html);
  html = keep('{{ACCESSORIES}}', acc, carouselCell, html);
  html = keep('{{ARTICLES}}', articles, articleCell, html);
  html = html.replace(/\{\{\w+\}\}/g, '');
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {T.homeScripts.map((s, i) => <script key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
    </>
  );
}
