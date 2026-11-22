// HTML generators that reproduce the approved template cards exactly (same classes/markup).
import { I } from './tpl';
import { enc, fromPrice, money, priceOptions } from './format';

export const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const thumb = (u: string) => (u || '').replace('/resized/large/', '/resized/medium/') || '/t/assets/images/logo.png';
export const href = (p: { urlPath: string }) => enc(p.urlPath);
const isMusic = (p: any) => p.digitalPrice != null || p.bothPrice != null;
const qv = (p: any) => {
  const opts = priceOptions(p);
  return `data-qv data-qv-id="${p.id}" data-qv-href="${href(p)}" data-qv-img="${esc(p.mainImage)}" data-qv-title="${esc(p.name)}" data-qv-price="${esc(fromPrice(p))}" data-qv-type="${isMusic(p) ? 'music' : 'item'}" data-qv-opts="${esc(JSON.stringify(opts))}"`;
};
const addAttr = (p: any) => { const o = priceOptions(p)[0]; return `data-add="${p.id}" data-mode="${o?.key || 'physical'}"`; };
const isNew = (p: any) => p.id >= 8700;

export function albumCard(p: any) {
  return `<div class="album-card"><div class="album-media"><a href="${href(p)}" class="album-cover"><img src="${esc(thumb(p.mainImage))}" alt="${esc(p.name)}" loading="lazy">${isNew(p) ? '<span class="album-badge">חדש</span>' : ''}</a><button type="button" class="album-eye" ${qv(p)} aria-label="תצוגה מהירה: ${esc(p.name)}">${I.albumEye}</button><button type="button" class="album-cart" ${addAttr(p)} aria-label="הוספה לסל: ${esc(p.name)}">${I.albumCart}</button></div><div class="album-info"><a href="${href(p)}" class="album-title">${esc(p.name)}</a><span class="album-price">${esc(fromPrice(p))}</span></div></div>`;
}
export function movieTile(p: any) {
  return `<div class="position-relative item-box group movie-tile"><a href="${href(p)}" aria-label="${esc(p.name)}"><img src="${esc(thumb(p.mainImage))}" alt="${esc(p.name)}" class="w-100 h-100 object-fit-cover item-img" loading="lazy"></a><div class="overlay"><div class="d-flex justify-content-center align-items-end gap-2 action-btns"><a href="${href(p)}" class="btn btn-primary" ${qv(p)} aria-label="תצוגה מהירה: ${esc(p.name)}">${I.itemEye}</a><a href="#" class="btn btn-accent" ${addAttr(p)} aria-label="הוספה לסל: ${esc(p.name)}">${I.itemCart}</a></div></div></div>`;
}
export function carouselCell(p: any) {
  return `<div class="carousel-cell"><div class="position-relative item-box group"><img src="${esc(thumb(p.mainImage))}" alt="${esc(p.name)}" class="w-100 h-100 object-fit-cover item-img" loading="lazy"><div class="overlay"><div class="d-flex justify-content-center align-items-end gap-2 action-btns"><a href="${href(p)}" class="btn btn-primary" ${qv(p)} aria-label="תצוגה מהירה: ${esc(p.name)}">${I.itemEye}</a><a href="#" class="btn btn-accent" ${addAttr(p)} aria-label="הוספה לסל: ${esc(p.name)}">${I.itemCart}</a></div></div></div></div>`;
}
export function articleCell(a: any) {
  const img = a.image || '/t/assets/images/ar-img-1.jpg';
  const d = new Date(a.createdAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const txt = String(a.shortContent || a.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  return `<div class="carousel-cell"><div class="card article-card"><img src="${esc(img)}" class="card-img-top" alt="${esc(a.title)}"><div class="card-body"><div class="d-flex date-box">${I.date}<span class="mt-1">${d}</span></div><h5 class="card-title">${esc(a.title)}</h5><p class="card-text">${esc(txt)}</p><a href="/${enc(a.url || 'articles/' + a.id)}" class="btn group">קרא עוד <span>←</span></a></div></div></div>`;
}
export function shopCard(p: any, i = 0, pinned = false) {
  const price = priceOptions(p)[0]?.price ?? 0;
  return `<article class="shop-card"${pinned ? ' data-pin="1"' : ''} data-price="${price}" data-name="${esc(p.name)}" data-i="${i}"><div class="shop-media">${pinned ? `<span class="shop-pin" title="מוצר נעוץ – מופיע ראשון" aria-label="מוצר נעוץ">${I.pin}</span>` : ''}<a href="${href(p)}" class="shop-img"><img src="${esc(thumb(p.mainImage))}" alt="${esc(p.name)}" loading="lazy"></a>${isNew(p) ? '<span class="shop-badge">חדש</span>' : ''}<div class="shop-icons"><button type="button" class="shop-icon" ${qv(p)} aria-label="תצוגה מהירה: ${esc(p.name)}">${I.shopEye}</button><button type="button" class="shop-icon wish" data-wish="${p.id}" aria-label="הוספה לרשימת המשאלות">${I.wish}</button></div><button type="button" class="shop-cart" ${addAttr(p)} aria-label="הוספה לסל: ${esc(p.name)}">${I.shopCart}<span>הוספה לסל</span></button></div><div class="shop-body"><a href="${href(p)}" class="shop-name">${esc(p.name)}</a><span class="shop-price">${esc(fromPrice(p))}</span></div></article>`;
}
export function bundleCard(p: any) {
  const n = p._count?.bundleItems;
  return `<a href="${href(p)}" class="bundle-card"><img src="${esc(thumb(p.mainImage))}" alt=""><span class="b-info"><span class="b-kind">${n ? `מארז · ${n} פריטים` : 'מארז'}</span><span class="b-name">${esc(p.name)}</span><span class="b-price">${esc(fromPrice(p))}</span></span></a>`;
}
export { money };
