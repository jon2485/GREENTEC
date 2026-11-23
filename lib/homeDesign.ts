// Editable homepage (admin → תוכן → עיצוב דף הבית). Defaults reproduce the approved template exactly.
import { db } from './db';
export type HomeSection = { token: string; label: string; title: string; categoryIds: number[]; count: number; link: string; enabled?: boolean };
export type HomeDesign = { heroAlbum: number | null; heroButton: string; sections: HomeSection[] };
export const HOME_DEFAULTS: HomeDesign = {
  heroAlbum: null, heroButton: 'לפרטים',
  sections: [
    { token: 'MUSIC', label: 'מוזיקה יהודית', title: 'מוזיקה יהודית', categoryIds: [56], count: 20, link: '' },
    { token: 'MOVIES', label: 'סרטים', title: '', categoryIds: [79], count: 8, link: '' },
    { token: 'JUDAICA', label: 'יודאיקה', title: 'יודאיקה', categoryIds: [80, 177], count: 20, link: '' },
    { token: 'GAMES', label: 'משחקים יהודיים', title: 'משחקים יהודיים', categoryIds: [351, 352], count: 20, link: '' },
    { token: 'ACCESSORIES', label: 'אביזרים', title: 'אביזרים', categoryIds: [81], count: 20, link: '' },
  ],
};
export async function getHomeDesign(): Promise<HomeDesign> {
  const row = await db.setting.findUnique({ where: { key: 'home_design' } }).catch(() => null);
  if (!row?.value) return HOME_DEFAULTS;
  try {
    const d = JSON.parse(row.value);
    return { ...HOME_DEFAULTS, ...d, sections: HOME_DEFAULTS.sections.map((s) => ({ ...s, ...((d.sections || []).find((x: any) => x.token === s.token) || {}) })) };
  } catch { return HOME_DEFAULTS; }
}
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Replace the section title (last header-text before the token) and the "לכל..." link after it.
export function applySection(html: string, s: HomeSection) {
  const i = html.indexOf(`{{${s.token}}}`); if (i < 0) return html;
  let out = html;
  if (s.title) {
    const before = out.slice(0, i); const j = before.lastIndexOf('class="header-text');
    if (j > 0) { const a = out.indexOf('>', j) + 1, b = out.indexOf('</h1>', a); if (a > 0 && b > a && b < i) out = out.slice(0, a) + esc(s.title) + out.slice(b); }
  }
  if (s.link) {
    const k = out.indexOf(`{{${s.token}}}`); const m = out.slice(k).match(/class="btn btn-secondary"/); const h = m ? out.indexOf('href="', out.lastIndexOf('<a ', k + m.index!)) : -1;
    if (h > k) { const e = out.indexOf('"', h + 6); out = out.slice(0, h + 6) + esc(s.link) + out.slice(e); }
  }
  return out;
}
export async function heroCells(albumId: number, button: string) {
  const imgs = await db.albumImage.findMany({ where: { albumId, active: true }, orderBy: { sort: 'asc' } });
  return imgs.map((im) => `<div class="carousel-cell w-100"><div class="position-relative heros d-flex justify-content-end flex-column"><div class="position-absolute heros-bg"><picture>${im.mobileImage ? `<source media="(max-width: 767px)" srcset="${esc(im.mobileImage)}">` : ''}<img src="${esc(im.image)}" alt="${esc(im.description || im.label)}" class="w-100 h-100 object-cover"></picture></div><div class="container position-relative z-1 heros-container">${im.label ? `<h6 class="subheader-text mb-12px">${esc(im.label)}</h6>` : ''}${im.description ? `<h1 class="header-text">${esc(im.description)}</h1>` : ''}${im.link ? `<div class="d-flex hero-btn"><a href="${esc(im.link)}" class="btn btn-primary">${esc(button || 'לפרטים')}</a></div>` : ''}</div></div></div>`).join('');
}
