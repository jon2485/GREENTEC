import { db } from '@/lib/db';
import { getCart } from '@/lib/cart';
import parts from './template-parts.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTopbar } from '@/lib/homeDesign';

// crisp vector logo (traced from the original artwork) – horizontal on phones, stacked on desktop
const LOGO_H = readFileSync(join(process.cwd(), 'components', 'logo-h.svg'), 'utf8');
const LOGO_V = readFileSync(join(process.cwd(), 'components', 'logo-v.svg'), 'utf8');
const escH = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

export default async function Header({ active = '/' }: { active?: string }) {
  const items = await db.menuItem.findMany({ where: { menuId: 1, parentId: null }, orderBy: { sort: 'asc' } });
  // Sub items exactly as in the legacy main menu (menu 1 tree, same order and labels as greentec.co.il)
  const subs = await db.menuItem.findMany({ where: { menuId: 1, parentId: { in: items.map((i) => i.id) } }, orderBy: { sort: 'asc' } });
  const cart = await getCart();
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const msgs = await getTopbar();
  const ann = msgs.map((m, i) => `<${m.link ? `a href="${escH(encodeURI(m.link))}"` : 'span'} class="gt-ann-item${i ? '' : ' on'}"><span class="gt-ann-dot" aria-hidden="true"></span>${escH(m.text)}</${m.link ? 'a' : 'span'}>`).join('');
  const left = (parts as any).leftMenu
    .replace(/<span class="position-absolute top-0 start-0 translate-middle badge rounded-pill">[\s\S]*?<\/span>\s*<\/span>/, count ? `<span class="position-absolute top-0 start-0 translate-middle badge rounded-pill">${count}</span>` : '')
    .replace('<button type="button" class="position-relative cart-button">', '<a href="/cart" class="position-relative cart-button" aria-label="סל קניות">')
    .replace(/<\/button>(\s*<\/div>\s*<!-- Profile -->)/, '</a>$1')
    .replace('<!-- Profile -->\n                    <a href="#"', '<!-- Profile -->\n                    <a href="/account" aria-label="החשבון שלי"')
    .replace(/\.\/assets\//g, '/t/assets/');
  return (
    <header className="main-header">
      <div className="gt-utility greenshow-utility-anchor">
        <div className="container gt-utility-in">
          <nav className="gt-utility-links" aria-label="אזור אישי">
            <a href="/cart">סל קניות</a>
            <a href="/account?tab=wishlist">רשימת משאלות</a>
            <a href="/account?tab=orders">ההזמנות שלי</a>
            <a href="/account?tab=downloads">ההורדות שלי</a>
            <a href="/account">התחברות</a>
          </nav>
          {msgs.length ? <div className="gt-ann" role="region" aria-label="הודעות" aria-live="polite" dangerouslySetInnerHTML={{ __html: ann }} /> : null}
          <div className="gs-topbar-promo" dir="ltr" role="group" aria-label="GreenShow — יש למה לצפות">
            <img className="gs-topbar-art" src="/t/assets/greenshow/greenshow_topbar_compact.png" alt="GreenShow — יש למה לצפות. הצצה ראשונה" width={1700} height={183} decoding="async" />
            <span className="gs-topbar-green-light" aria-hidden="true"></span>
            <a className="gs-topbar-cta" href="#greenshow" aria-label="הצצה ראשונה ל-GreenShow" title="הצצה ראשונה ל-GreenShow"></a>
          </div>
          <a className="gs-topbar-mobile-link" href="#greenshow" aria-label="הצצה ראשונה ל-GreenShow" dir="ltr"><span>Green<span className="gs-topbar-lime">Show</span></span><span className="gs-topbar-mobile-label" dir="rtl">הצצה ראשונה ‹</span></a>
        </div>
      </div>
      <span dangerouslySetInnerHTML={{ __html: (parts as any).bgLeft + (parts as any).bgRight }} />
      <div className="container d-flex justify-content-between align-items-center">
        <button className="d-lg-none btn-toogle-nav text-white" id="toggle-nav" aria-label="תפריט" dangerouslySetInnerHTML={{ __html: (parts as any).toggle }} />
        <div className="d-flex right-side nav-open" id="nav">
          <span dangerouslySetInnerHTML={{ __html: (parts as any).menuBgLeft + (parts as any).menuBgRight }} />
          <a className="d-none d-lg-block logo-desk gt-logo" href="/" aria-label="גרינטק – לדף הבית" dangerouslySetInnerHTML={{ __html: LOGO_V }} />
          <ul className="navbar-nav">
            {items.map((it) => {
              const sub = subs.filter((k) => k.parentId === it.id && k.link);
              const cls = 'nav-link' + (active === it.link ? ' active' : '');
              if (!sub.length) return <li key={it.id} className="nav-item group"><a className={cls} href={it.link || '#'}>{it.title}</a></li>;
              return (
                <li key={it.id} className="nav-item group dropdown">
                  <a className={cls + ' dropdown-toggle'} href={it.link || '#'} role="button" aria-expanded="false">{it.title}</a>
                  <button type="button" className="gt-chev d-lg-none" aria-label={`פתיחת תת־קטגוריות: ${it.title}`} dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' }} />
                  <div className="dropdown-menu submenu">
                    <div className="submenu-box position-relative">
                      <div className="container submenu-container">
                        <ul className="gt-sub-grid list-none">
                          {sub.map((k) => (
                            <li key={k.id}><a href={k.link} className="submenu-link text-white">{k.title}</a></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <a href="/" className="middle-logo d-lg-none gt-logo" aria-label="גרינטק – לדף הבית" dangerouslySetInnerHTML={{ __html: LOGO_H }} />
        <div className="d-flex left-menu-wrap" dangerouslySetInnerHTML={{ __html: left.replace('<!-- Left Menu -->', '') }} />
      </div>
    </header>
  );
}
