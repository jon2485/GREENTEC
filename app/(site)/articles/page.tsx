import { db } from '@/lib/db';
import { articleCell } from '@/lib/render';
import { contentPage } from '@/lib/pages';
import { SITE, ldScript, breadcrumbs } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'מאמרים', // as on the legacy page
  description: 'מאמרים, כתבות וסיפורים מעולם המוזיקה היהודית והתוכן היהודי – באתר גרינטק.',
  alternates: { canonical: SITE + '/articles/' }, // the legacy canonical
  openGraph: { title: 'מאמרים', url: SITE + '/articles/', type: 'website', siteName: 'גרינטק', locale: 'he_IL' },
};
export default async function Articles() {
  const a = await db.article.findMany({ where: { status: true }, orderBy: { id: 'desc' } });
  const grid = `<div class="row g-4">${a.map((x) => `<div class="col-12 col-md-6 col-lg-4">${articleCell(x).replace('class="carousel-cell"', 'class="h-100"')}</div>`).join('')}</div>`;
  const seo = ldScript(breadcrumbs([{ name: 'מאמרים' }]), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'מאמרים', url: SITE + '/articles', mainEntity: { '@type': 'ItemList', itemListElement: a.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: x.url ? SITE + '/' + encodeURI(x.url) : `${SITE}/articles/id/${x.id}`, name: x.title })) } });
  return <div className="recent-articles-section" dangerouslySetInnerHTML={{ __html: seo + contentPage({ title: 'מאמרים', html: grid, crumbs: [{ name: 'מאמרים' }], kicker: 'גרינטק' }) }} />;
}
