import { db } from '@/lib/db';
import { getCart } from '@/lib/cart';
import parts from './template-parts.json';

const icons = ['icon-1', 'icon-2', 'icon-3', 'icon-4', 'icon-5', 'icon-6', 'icon-7', 'icon-8'];

export default async function Header({ active = '/' }: { active?: string }) {
  const items = await db.menuItem.findMany({ where: { menuId: 1, parentId: null }, orderBy: { sort: 'asc' } });
  const catIds = items.filter((i) => i.type === 'category' && i.contentId != null).map((i) => i.contentId!);
  const kids = await db.category.findMany({ where: { parentId: { in: catIds }, showInMenu: true }, orderBy: { sort: 'asc' } });
  const cart = await getCart();
  const count = cart.reduce((a, l) => a + l.qty, 0);
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
          <a className="d-none d-lg-block logo-desk" href="/"><img src="/t/assets/images/logo.png" alt="גרינטק – מוזיקה ותוכן יהודי" className="logo-img" /></a>
          <ul className="navbar-nav">
            {items.map((it) => {
              const sub = kids.filter((k) => k.parentId === it.contentId);
              const cls = 'nav-link' + (active === it.link ? ' active' : '');
              if (!sub.length) return <li key={it.id} className="nav-item group"><a className={cls} href={it.link}>{it.title}</a></li>;
              const cols: typeof sub[] = []; for (let i = 0; i < sub.length; i += 10) cols.push(sub.slice(i, i + 10));
              return (
                <li key={it.id} className="nav-item group dropdown">
                  <a className={cls + ' dropdown-toggle'} href={it.link} role="button" aria-expanded="false">{it.title}</a>
                  <div className="dropdown-menu submenu">
                    <div className="submenu-box position-relative">
                      <div className="container submenu-container">
                        <div className="d-lg-flex flex-lg-row gap-x-80px">
                          {cols.map((col, ci) => (
                            <div className="mb-24px" key={ci}>
                              <ul className="gap-36px d-flex flex-column list-none">
                                {col.map((k, ki) => (
                                  <li key={k.id}><a href={'/' + k.url} className="d-flex align-items-center gap-20px fs-18px font-heebo fw-light text-white submenu-link"><img src={`/t/assets/images/${icons[ki % icons.length]}.svg`} alt="" className="submenu-icon" /><span>{k.name}</span></a></li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <a href="/" className="middle-logo d-lg-none"><img src="/t/assets/images/logo-v.png" alt="גרינטק" className="logo-img" /></a>
        <div className="d-flex left-menu-wrap" dangerouslySetInnerHTML={{ __html: left.replace('<!-- Left Menu -->', '') }} />
      </div>
    </header>
  );
}
