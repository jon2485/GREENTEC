// /admin?am={module}&ac={action}&id={id} – same URL scheme as the UPME admin.
import { requireAdmin } from '@/lib/auth';
import { MENU, findMenu, USER_TYPES } from '@/lib/admin/menu';
import { esc, A, card } from '@/lib/admin/ui';
import { findResource, listScreen, editScreen } from '@/lib/admin/resources';
import * as P from '@/lib/admin/products';
import * as O from '@/lib/admin/orders';
import * as C from '@/lib/admin/content';
import { legacyImportScreen } from '@/lib/admin/legacyImport';
import * as S from '@/lib/admin/studio';

export const dynamic = 'force-dynamic';

async function screen(am: string, ac: string, id: number, sp: Record<string, string>, user: any): Promise<string> {
  const k = `${am}/${ac}`;
  switch (k) {
    case 'products/manage': return P.productsManage(sp);
    case 'products/edit': return P.productEdit(id);
    case 'products/manage_cat': return P.categoriesManage();
    case 'products/edit_cat': return P.categoryEdit(sp.id === 'new' ? null : id);
    case 'products/cat_items': return P.categoryItems(id);
    case 'products/inventory': return P.inventory(sp);
    case 'ProductVariations/inventory_v': return P.inventoryV();
    case 'products/recycle_bin': return P.recycleBin();
    case 'products/bulk_price': return P.bulkPrice(sp);
    case 'products/importTools': return P.importTools();
    case 'ProductProperties/manage_prod_props_lists': return P.propLists();
    case 'ProductsSets/manage_sets': return P.setsManage(sp);
    case 'ProductsSets/manage_rels': return P.setRels(id);
    case 'ProductSuppliers/items': return P.supplierItems(id);
    case 'orders/manage': return O.ordersManage(sp);
    case 'orders/deleted_list': return O.ordersManage(sp, true);
    case 'orders/view': return O.orderView(id);
    case 'orders/customer_view': return O.orderCustomerView(id);
    case 'orders/abandoned_carts': return O.abandonedCarts();
    case 'orders/statistics': return O.reportOrderStats(sp);
    case 'user/manage': return O.usersManage(sp);
    case 'user/edit_user': return O.userEdit(id);
    case 'admin/createUser': return O.createUser();
    case 'admin/profile': return O.profile(user);
    case 'user/orders_reports': return O.reportUserOrders(sp);
    case 'search/reports': return O.reportSearches();
    case 'wishlist/w_statistics': return O.reportWishlist();
    case 'ProductsDigitalDownloads/pdd_statistics': return O.reportDigital(sp) as Promise<string>;
    case 'userwatch/products_statistics': return O.reportProducts();
    case 'campaigns/statistics': return O.reportCampaigns();
    case 'reports/google_searches': return C.googleSearches();
    case 'menus/manage': return C.menusManage();
    case 'menus/items': return C.menuItems(id);
    case 'albums/manage': return C.albumsManage();
    case 'albums/images': return C.albumImages(id);
    case 'design/homepage': return C.designHome();
    case 'shipping/countries_list': return C.countries();
    case 'configs/manage_images': return C.manageImages();
    case 'configs/shutdown_site': return C.shutdownScreen();
    case 'configs/legacy_import': return legacyImportScreen();
    case 'dashboard/index': return C.dashboard();
    case 'studio/projects': return S.projects();
    case 'studio/project': return S.project(id);
    case 'studio/task': return S.task(id);
    case 'studio/version': return S.version(id);
    case 'studio/agents': return S.agents();
    case 'studio/agent': return S.agent(sp.agent || '');
  }
  if (C.SETTINGS[k]) return C.settingsScreen(k);
  const r = findResource(am, ac);
  if (r) {
    if (ac === r.ac) return listScreen(r, sp);
    let html = await editScreen(r, id);
    if (r.model === 'supplier' && id) html += `<div class="mb-4"><a class="btn btn-light-primary" href="${A('ProductSuppliers', 'items', { id })}">מוצרי היצרן · סידור ונעיצה</a></div>`;
    return html;
  }
  return card('המסך לא נמצא', `<p>אין מסך עבור <code>am=${esc(am)}&amp;ac=${esc(ac)}</code>.</p>`);
}

function sidebar(am: string, ac: string) {
  return MENU.map((g) => {
    const open = g.items.some((i) => i.am === am && i.ac === ac) || (g.group === 'מוצרים' && ['products', 'ProductsSets', 'ProductSuppliers'].includes(am)) || (g.group === 'הזמנות' && am === 'orders') || (g.group === 'אולפן AI' && am === 'studio');
    return `<div class="adm-nav-group${open ? ' open' : ''}"><button type="button" class="adm-nav-head" data-nav-toggle><span>${g.icon}</span> ${g.group}</button><ul>${g.items.map((i) => `<li><a href="${A(i.am, i.ac)}" class="${i.am === am && i.ac === ac ? 'active' : ''}">${esc(i.title)}</a></li>`).join('')}</ul></div>`;
  }).join('');
}

const loginHtml = `<div class="adm-login"><form data-ajax action="/admin/adminAjax/admin/login" class="card p-4 shadow-sm"><img src="/t/assets/images/logo-v.png" alt="גרינטק" class="mx-auto mb-3" style="height:64px"><h1 class="h5 text-center mb-3">כניסה לממשק הניהול</h1><div class="mb-3"><label class="form-label">מייל</label><input class="form-control" type="email" name="email" required autocomplete="username"></div><div class="mb-3"><label class="form-label">סיסמה</label><input class="form-control" type="password" name="password" required autocomplete="current-password"></div><button class="btn btn-primary w-100">כניסה</button></form></div>`;

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  if (!user) return <div dangerouslySetInnerHTML={{ __html: loginHtml }} />;
  P.runDueTasks().catch(() => {});
  const am = sp.am || 'dashboard', ac = sp.ac || 'index', id = Number(sp.id || 0);
  let body: string;
  try { body = await screen(am, ac, id, sp, user); } catch (e: any) { console.error('[admin]', am, ac, e); body = card('שגיאה', `<pre class="small" dir="ltr">${esc(e?.message || e)}</pre>`); }
  const title = findMenu(am, ac)?.title || findMenu(am, 'manage')?.title || (am === 'studio' ? 'אולפן AI' : '');
  const html = `<div class="adm-shell"><aside class="adm-side" id="admSide"><a href="/admin" class="adm-brand"><img src="/t/assets/images/logo-v.png" alt=""> <span>GREENTEC</span></a><nav>${sidebar(am, ac)}</nav></aside>
  <div class="adm-main"><header class="adm-top"><button type="button" class="btn btn-sm btn-light d-lg-none" data-side-toggle>☰</button><div class="adm-crumb">${title ? esc(title) : 'לוח בקרה'}</div><div class="ms-auto d-flex align-items-center gap-2"><a href="/" target="_blank" class="btn btn-sm btn-light">לאתר ↗</a><span class="small text-muted d-none d-md-inline">${esc(user.name || user.email)} · ${esc(USER_TYPES.find(([k]) => k === user.type)?.[1] || '')}</span><a href="/admin/adminAjax/admin/logout" class="btn btn-sm btn-light">יציאה</a></div></header>
  <main class="adm-content">${body}</main></div></div><div class="adm-toast" id="admToast"></div>`;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
