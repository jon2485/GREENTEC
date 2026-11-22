// Small HTML-string helpers for the admin screens (same approach as the storefront: server-rendered strings).
export const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const A = (am: string, ac: string, extra: Record<string, any> = {}) => {
  const q = new URLSearchParams({ am, ac, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])) });
  return '/admin?' + q.toString();
};
export const AJ = (mod: string, action: string, id?: any) => `/admin/adminAjax/${mod}/${action}${id !== undefined && id !== null && id !== '' ? '/' + id : ''}`;
export const dt = (d?: Date | null, time = true) => (d ? (time ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })) : '');
export const num = (v: any) => (v === null || v === undefined ? '' : String(Number(v)));
export const shekel = (v: any) => (v === null || v === undefined || v === '' ? '' : '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 }));

export function card(title: string, body: string, tools = '') {
  return `<div class="card adm-card mb-4"><div class="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap"><h3 class="card-title m-0">${title}</h3><div class="d-flex gap-2 flex-wrap">${tools}</div></div><div class="card-body">${body}</div></div>`;
}
export const btn = (href: string, label: string, cls = 'btn-primary') => `<a href="${esc(href)}" class="btn btn-sm ${cls}">${label}</a>`;
export const actBtn = (url: string, label: string, confirmMsg = '', cls = 'btn-light-danger') =>
  `<button type="button" class="btn btn-sm ${cls}" data-act="${esc(url)}"${confirmMsg ? ` data-confirm="${esc(confirmMsg)}"` : ''}>${label}</button>`;

export function table(head: string[], rows: string[][], cls = '') {
  return `<div class="table-responsive"><table class="table table-hover align-middle adm-table ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="text-center text-muted py-4">אין נתונים להצגה</td></tr>`}</tbody></table></div>`;
}

export function pager(base: string, page: number, pages: number, total: number) {
  if (pages <= 1) return `<div class="text-muted small mt-2">סה״כ ${total.toLocaleString('he-IL')} רשומות</div>`;
  const u = (p: number) => base + (base.includes('?') ? '&' : '?') + 'page=' + p;
  const nums: number[] = [];
  for (let p = Math.max(1, page - 3); p <= Math.min(pages, page + 3); p++) nums.push(p);
  return `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3"><div class="text-muted small">סה״כ ${total.toLocaleString('he-IL')} רשומות · עמוד ${page} מתוך ${pages}</div><ul class="pagination pagination-sm m-0">${page > 1 ? `<li class="page-item"><a class="page-link" href="${esc(u(1))}">«</a></li>` : ''}${nums.map((p) => `<li class="page-item${p === page ? ' active' : ''}"><a class="page-link" href="${esc(u(p))}">${p}</a></li>`).join('')}${page < pages ? `<li class="page-item"><a class="page-link" href="${esc(u(pages))}">»</a></li>` : ''}</ul></div>`;
}

// ---- form fields ----
export type Opt = [string | number, string];
export const fText = (name: string, label: string, v: any = '', type = 'text', attrs = '') =>
  `<div class="mb-3"><label class="form-label">${label}</label><input type="${type}" class="form-control" name="${name}" value="${esc(v)}" ${attrs}></div>`;
export const fArea = (name: string, label: string, v: any = '', rows = 4, html = false) =>
  `<div class="mb-3"><label class="form-label">${label}</label>${html ? '<div class="adm-html-tools"><button type="button" class="btn btn-sm btn-light" data-html-preview>תצוגה מקדימה</button></div>' : ''}<textarea class="form-control${html ? ' adm-html font-monospace' : ''}" name="${name}" rows="${rows}" dir="${html ? 'rtl' : 'auto'}">${esc(v)}</textarea></div>`;
export const fBool = (name: string, label: string, v: any) =>
  `<div class="form-check form-switch mb-3"><input type="hidden" name="${name}" value="0"><input class="form-check-input" type="checkbox" role="switch" name="${name}" value="1" id="f_${name}"${v ? ' checked' : ''}><label class="form-check-label" for="f_${name}">${label}</label></div>`;
export const fSelect = (name: string, label: string, v: any, opts: Opt[], attrs = '') =>
  `<div class="mb-3"><label class="form-label">${label}</label><select class="form-select" name="${name}" ${attrs}>${opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
export const fChecks = (name: string, label: string, values: (string | number)[], opts: Opt[], filter = false) =>
  `<div class="mb-3"><label class="form-label">${label}</label>${filter ? `<input type="search" class="form-control form-control-sm mb-2" placeholder="סינון..." data-filter-list>` : ''}<div class="adm-checklist">${opts.map(([k, l]) => `<label class="form-check"><input class="form-check-input" type="checkbox" name="${name}" value="${esc(k)}"${values.map(String).includes(String(k)) ? ' checked' : ''}> <span class="form-check-label">${esc(l)}</span></label>`).join('')}</div></div>`;
export const fImage = (name: string, label: string, v: any = '', folder = 'media/misc') =>
  `<div class="mb-3"><label class="form-label">${label}</label><div class="input-group"><input type="text" class="form-control" name="${name}" value="${esc(v)}" dir="ltr"><label class="btn btn-light border mb-0">העלאה<input type="file" accept="image/*" hidden data-upload-to="${name}" data-folder="${esc(folder)}"></label></div>${v ? `<img src="${esc(v)}" class="adm-thumb mt-2" alt="">` : ''}</div>`;
// product picker: hidden comma list + chips + live search (admin.js)
export const fPicker = (name: string, label: string, items: { id: number; name: string }[], help = '') =>
  `<div class="mb-3" data-picker><label class="form-label">${label}</label><input type="hidden" name="${name}" value="${items.map((i) => i.id).join(',')}"><div class="adm-chips">${items.map((i) => `<span class="adm-chip" data-id="${i.id}">${esc(i.name)} <small>#${i.id}</small> <b data-rm>×</b></span>`).join('')}</div><input type="search" class="form-control form-control-sm mt-2" placeholder="חיפוש מוצר לפי שם או מזהה..." data-picker-q><div class="adm-picker-res list-group"></div>${help ? `<div class="form-text">${help}</div>` : ''}</div>`;

export const seoFields = (o: any) =>
  fSelect('robots', 'robots', o.robots || 'all', [['all', 'all'], ['index, follow', 'index, follow'], ['noindex, follow', 'noindex, follow'], ['noindex, nofollow', 'noindex, nofollow']]) +
  fText('metaTitle', 'כותרת (title)', o.metaTitle) + fText('metaKeywords', 'מילות מפתח', o.metaKeywords) + fArea('metaDescription', 'תיאור (meta description)', o.metaDescription, 3) +
  fText('ogTitle', 'og:title', o.ogTitle) + fArea('ogDescription', 'og:description', o.ogDescription, 2) + fImage('ogImage', 'og:image', o.ogImage, 'media/og');

export const form = (action: string, inner: string, submit = 'שמירה', extra = '') =>
  `<form data-ajax action="${esc(action)}" method="post"${extra}>${inner}<div class="adm-savebar"><button type="submit" class="btn btn-primary px-4">${submit}</button></div></form>`;

export function tabs(id: string, list: [string, string, string][]) {
  return `<ul class="nav nav-tabs adm-tabs flex-nowrap overflow-auto" role="tablist">${list.map(([k, l], i) => `<li class="nav-item"><button type="button" class="nav-link${i === 0 ? ' active' : ''}" data-bs-toggle="tab" data-bs-target="#${id}-${k}" data-tab-key="${k}">${l}</button></li>`).join('')}</ul><div class="tab-content pt-3">${list.map(([k, , b], i) => `<div class="tab-pane fade${i === 0 ? ' show active' : ''}" id="${id}-${k}">${b}</div>`).join('')}</div>`;
}
export const filterBar = (am: string, ac: string, inner: string) =>
  `<form method="get" action="/admin" class="adm-filters row g-2 align-items-end mb-3"><input type="hidden" name="am" value="${esc(am)}"><input type="hidden" name="ac" value="${esc(ac)}">${inner}<div class="col-auto"><button class="btn btn-sm btn-primary">סינון</button> <a class="btn btn-sm btn-light" href="${esc(A(am, ac))}">ניקוי</a></div></form>`;
export const fcol = (name: string, label: string, v: any, type = 'text', w = 'col-6 col-md-2') => `<div class="${w}"><label class="form-label small mb-1">${label}</label><input class="form-control form-control-sm" type="${type}" name="${name}" value="${esc(v ?? '')}"></div>`;
export const fcolSel = (name: string, label: string, v: any, opts: Opt[], w = 'col-6 col-md-2') => `<div class="${w}"><label class="form-label small mb-1">${label}</label><select class="form-select form-select-sm" name="${name}"><option value="">הכל</option>${opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
export const badge = (t: string, c = 'secondary') => `<span class="badge text-bg-${c}">${esc(t)}</span>`;
