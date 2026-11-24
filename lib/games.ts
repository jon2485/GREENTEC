// "משחקים" – a designed games store at the legacy category URL (/משחקים). Same URL, title, description, H1 and
// category text as before (SEO unchanged); the page groups the games into themed shelves.
import { db } from './db';
import { cardSelect } from './catalog';
import { shopCard, esc } from './render';
import { crumbsHtml } from './pages';
import { enc } from './format';

export const GAMES_URL = 'משחקים';
// the categories the games area draws from (legacy URLs)
const SOURCES = ['משחקים', 'סרטים-ומשחקים-לימודיים', 'חוברות-צביעה-ופעילות', 'ספרונים-לילדים'];

const ic = (d: string) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// themed shelves – a product goes on the first shelf whose rule matches (name or source category)
const SHELVES: { key: string; title: string; sub: string; icon: string; test: (p: any, src: string) => boolean }[] = [
  { key: 'shabbat', title: 'שבת, חגים ומצוות', sub: 'ערכות משחק, טלית, ספר תורה ועוד', icon: ic('<path d="M16 8v8M24 6v10M32 8v8"/><path d="M12 18h24l-3 22H15z"/><path d="M18 26h12"/>'),
    test: (p) => /שבת|טלית|ספר תורה|חנוכה|פסח|סוכות|פורים|מצו?ות|770|מקדש/.test(p.name) && !/פאזל/.test(p.name) },
  { key: 'dolls', title: 'בובות וחברים', sub: 'בובות יהודיות לילדים', icon: ic('<circle cx="24" cy="14" r="7"/><path d="M14 40c0-8 4-14 10-14s10 6 10 14"/><path d="M19 13h.01M29 13h.01"/>'),
    test: (p) => /בובה|בובת/.test(p.name) },
  { key: 'puzzles', title: 'פאזלים ובנייה', sub: 'פאזלים, תלת־מימד ובנייה', icon: ic('<path d="M8 8h13v6a3 3 0 1 0 6 0V8h13v13h-6a3 3 0 1 0 0 6h6v13H27v-6a3 3 0 1 0-6 0v6H8V27h6a3 3 0 1 0 0-6H8z"/>'),
    test: (p) => /פאזל|בונים|בנייה|תלת מימד|לגו/.test(p.name) },
  { key: 'stories', title: 'סיפור ומתנה', sub: 'מארזי סיפור ומשחק', icon: ic('<rect x="8" y="18" width="32" height="22" rx="3"/><path d="M6 12h36v6H6zM24 12v28"/><path d="M24 12c-4-6-11-5-10 0M24 12c4-6 11-5 10 0"/>'),
    test: (p) => /סיפור של מתנה|מארז/.test(p.name) },
  { key: 'letters', title: 'אותיות, קריאה וחשבון', sub: 'לומדים בכיף – אלף בית, כפל ועוד', icon: ic('<path d="M8 38 18 10h2l10 28M11 30h16"/><path d="M34 22v16M30 26h8"/>'),
    test: (p) => /אלף בית|קרוא|כפל|מספר|דקדוק|אנגלית|חשבון/.test(p.name) },
  { key: 'learning', title: 'משחקי למידה ומחשב', sub: 'משחקים חינוכיים, סרטים ופעילויות', icon: ic('<rect x="6" y="10" width="36" height="22" rx="3"/><path d="M18 40h12M24 32v8"/><path d="m20 17 8 4-8 4z"/>'),
    test: (p, src) => src === 'סרטים-ומשחקים-לימודיים' },
  { key: 'activity', title: 'יצירה, צביעה וספרונים', sub: 'חוברות צביעה, פעילות וספרונים', icon: ic('<path d="M30 8 40 18 18 40H8V30z"/><path d="m26 12 10 10"/>'),
    test: (p, src) => src === 'חוברות-צביעה-ופעילות' || src === 'ספרונים-לילדים' },
  { key: 'more', title: 'עוד משחקים', sub: 'כל השאר', icon: ic('<rect x="8" y="14" width="32" height="20" rx="10"/><path d="M16 20v8M12 24h8"/><circle cx="31" cy="22" r="1.5"/><circle cx="35" cy="26" r="1.5"/>'),
    test: () => true },
];

export async function gamesPage(c: { id: number; name: string; header?: string | null; content?: string | null }, crumbs: { name: string; url?: string }[]) {
  const cats = await db.category.findMany({ where: { url: { in: SOURCES } }, select: { id: true, url: true } });
  const links = await db.productCategory.findMany({ where: { categoryId: { in: cats.map((x) => x.id) }, product: { status: 1 } }, select: { categoryId: true, pinned: true, product: { select: cardSelect } } });
  const srcOf = new Map(cats.map((x) => [x.id, x.url]));
  // one entry per product, keeping the "most specific" source (games first)
  const seen = new Map<number, { p: any; src: string; pinned: boolean }>();
  for (const l of links.sort((a, b) => SOURCES.indexOf(srcOf.get(a.categoryId)!) - SOURCES.indexOf(srcOf.get(b.categoryId)!)))
    if (!seen.has(l.product.id)) seen.set(l.product.id, { p: l.product, src: srcOf.get(l.categoryId)!, pinned: l.pinned });
  const all = [...seen.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.p.sort - a.p.sort || b.p.id - a.p.id);
  const shelves = SHELVES.map((s) => ({ ...s, items: [] as any[] }));
  for (const x of all) shelves.find((s) => s.test(x.p, x.src))!.items.push(x);
  const used = shelves.filter((s) => s.items.length);
  const fresh = all.filter((x) => x.src === 'משחקים').slice(0, 8);
  const tiles = used.map((s) => `<a href="#g-${s.key}" class="gz-tile"><span class="gz-ic">${s.icon}</span><span class="gz-tt">${esc(s.title)}</span><span class="gz-n">${s.items.length} פריטים</span></a>`).join('');
  const row = (items: any[]) => `<div class="gz-row">${items.map((x, i) => shopCard(x.p, i, x.pinned)).join('')}</div>`;
  const sections = used.map((s) => `<section class="gz-shelf" id="g-${s.key}" aria-labelledby="g-${s.key}-t"><div class="gz-shelf-head"><span class="gz-ic sm">${s.icon}</span><div><h2 id="g-${s.key}-t">${esc(s.title)}</h2><p>${esc(s.sub)}</p></div><span class="gz-count">${s.items.length}</span></div>${row(s.items)}</section>`).join('');
  const title = c.header || c.name;
  return `<section class="gz">
<div class="gz-hero"><div class="container"><span class="gz-kicker">חנות גרינטק</span><h1 class="gz-title">${esc(title)}</h1><p class="gz-lead">משחקים, צעצועים ופעילויות ברוח יהודית – לשבת, לחגים, ללימוד ולכיף של כל המשפחה.</p>${crumbsHtml(crumbs)}
<div class="gz-stats"><span><b>${all.length}</b> פריטים</span><span><b>${used.length}</b> קטגוריות</span><span>משלוח עד הבית</span></div></div>
<svg class="gz-deco" viewBox="0 0 400 300" aria-hidden="true"><g fill="none" stroke="#cadb2d" stroke-width="3" opacity=".55"><rect x="40" y="40" width="70" height="70" rx="14" transform="rotate(-12 75 75)"/><circle cx="92" cy="64" r="5" fill="#cadb2d"/><circle cx="62" cy="92" r="5" fill="#cadb2d"/><path d="M220 60l22 38h-44z" transform="rotate(14 220 80)"/><path d="M300 150h28v28h-28zM328 164h22a10 10 0 1 1 0 0"/><path d="M120 200c20-30 60-30 80 0s60 30 80 0"/></g></svg></div>
<div class="container gz-body">
<nav class="gz-tiles" aria-label="קטגוריות משחקים">${tiles}</nav>
${fresh.length > 3 ? `<section class="gz-shelf gz-new" aria-labelledby="g-new-t"><div class="gz-shelf-head"><span class="gz-ic sm">${ic('<path d="m24 6 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>')}</span><div><h2 id="g-new-t">חדשים במשחקים</h2><p>המשחקים האחרונים שהגיעו לחנות</p></div></div>${row(fresh)}</section>` : ''}
${sections}
${c.content ? `<div class="gz-about gt-content">${c.content}</div>` : ''}
<p class="gz-all"><a href="${enc('/' + GAMES_URL)}?view=all" rel="nofollow">לכל ${all.length} הפריטים ברשימה אחת ›</a></p>
</div></section>`;
}
