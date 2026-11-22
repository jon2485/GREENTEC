import { db } from '@/lib/db';
import { articleCell } from '@/lib/render';
import { contentPage } from '@/lib/pages';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'מאמרים | גרינטק' };
export default async function Articles() {
  const a = await db.article.findMany({ where: { status: true }, orderBy: { id: 'desc' } });
  const grid = `<div class="row g-4">${a.map((x) => `<div class="col-12 col-md-6 col-lg-4">${articleCell(x).replace('class="carousel-cell"', 'class="h-100"')}</div>`).join('')}</div>`;
  return <div className="recent-articles-section" dangerouslySetInnerHTML={{ __html: contentPage({ title: 'מאמרים', html: grid, crumbs: [{ name: 'מאמרים' }], kicker: 'גרינטק' }) }} />;
}
