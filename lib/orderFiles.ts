// Download buttons per order line (as on greentec.co.il: every paid digital line of an order has its download button;
// a bundle has one per component plus "הורדת כל הקבצים"). Used by the customer's account and by the admin.
import { db } from './db';

export type LineFiles = { itemId: number; digital: boolean; files: { productId: number; name: string }[] };
export const isDigitalLine = (mode: string, onlyDigital?: boolean | null) => mode === 'digital' || mode === 'both' || !!onlyDigital;

/** order id → its lines' files (only lines that include a download). */
export async function orderLineFiles(orderIds: number[]) {
  if (!orderIds.length) return new Map<number, LineFiles[]>();
  const items = await db.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, orderId: true, mode: true, product: { select: { id: true, name: true, previewName: true, digitalFile: true, onlyDigital: true, bundleItems: { orderBy: { sort: 'asc' }, select: { product: { select: { id: true, name: true, previewName: true, digitalFile: true } } } } } } },
  });
  const out = new Map<number, LineFiles[]>();
  for (const i of items) {
    const p = i.product; const digital = isDigitalLine(i.mode, p?.onlyDigital);
    const files = p ? [p, ...p.bundleItems.map((b) => b.product)].filter((x) => x.digitalFile).map((x) => ({ productId: x.id, name: x.previewName || x.name })) : [];
    const list = out.get(i.orderId) || []; list.push({ itemId: i.id, digital, files }); out.set(i.orderId, list);
  }
  return out;
}
/** The buttons for one line, in the storefront template's style. */
export function lineButtonsHtml(lf: LineFiles | undefined, paid: boolean, esc: (s: any) => string) {
  if (!lf || !lf.digital) return '';
  if (!paid) return '<span class="dl-note">ההורדה תיפתח אחרי התשלום</span>';
  if (!lf.files.length) return '<span class="dl-note">הקובץ יהיה זמין להורדה בקרוב</span>';
  const one = (f: { productId: number; name: string }) => `<a class="btn btn-primary btn-sm dl-btn" href="/api/download/${f.productId}">הורדה${lf.files.length > 1 ? `: ${esc(f.name)}` : ''}</a>`;
  return `<div class="dl-btns">${lf.files.map(one).join('')}${lf.files.length > 1 ? `<button type="button" class="btn btn-sm dl-btn dl-all" data-dl-all="${lf.files.map((f) => f.productId).join(',')}">הורדת כל הקבצים</button>` : ''}</div>`;
}
