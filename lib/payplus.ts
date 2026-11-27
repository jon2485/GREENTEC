// PayPlus (payplus.co.il) hosted payment page. Keys live only in Railway variables:
//   PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, PAYPLUS_PAGE_UID, PAYPLUS_ENV = staging (test terminal, default) | production
// Flow: /api/payplus/start → PaymentPages/generateLink → the customer pays on PayPlus → PayPlus calls
// /api/payplus/callback (signed: HMAC-SHA256 of the body with the secret key, base64, header "hash") and sends the
// customer back to /pay/{id}. An order is marked paid only after PayPlus itself confirms the transaction (IPN query)
// and the amount equals the order total – never on the word of a redirect or an unsigned request.
import crypto from 'node:crypto';

const env = (k: string) => (process.env[k] || '').trim();
export const payplusReady = () => !!(env('PAYPLUS_API_KEY') && env('PAYPLUS_SECRET_KEY') && env('PAYPLUS_PAGE_UID'));
export const payplusLive = () => env('PAYPLUS_ENV') === 'production';
const base = () => (payplusLive() ? 'https://restapi.payplus.co.il/api/v1.0/' : 'https://restapidev.payplus.co.il/api/v1.0/');

async function call(path: string, body: any) {
  const r = await fetch(base() + path, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', 'api-key': env('PAYPLUS_API_KEY'), 'secret-key': env('PAYPLUS_SECRET_KEY') },
    body: JSON.stringify(body),
  });
  const text = await r.text(); let j: any = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok || !j) throw new Error(`PayPlus ${path} HTTP ${r.status}`);
  return j;
}

export async function createPaymentLink(o: { id: number; total: any; firstName: string; lastName: string; email: string; phone: string }, site: string) {
  const amount = Math.round(Number(o.total) * 100) / 100;
  const j = await call('PaymentPages/generateLink', {
    payment_page_uid: env('PAYPLUS_PAGE_UID'), charge_method: 1, amount, currency_code: 'ILS', language_code: 'he',
    sendEmailApproval: true, sendEmailFailure: false,
    refURL_success: `${site}/pay/${o.id}?pp=1`, refURL_failure: `${site}/pay/${o.id}?fail=1`, refURL_cancel: `${site}/pay/${o.id}?fail=1`,
    refURL_callback: `${site}/api/payplus/callback`, send_failure_callback: false,
    more_info: String(o.id), more_info_2: 'greentec',
    customer: { customer_name: `${o.firstName} ${o.lastName}`.trim() || o.email, email: o.email, phone: o.phone },
    items: [{ name: `הזמנה ${o.id} – גרינטק`, quantity: 1, price: amount, vat_type: 0 }],
  });
  const link = j?.data?.payment_page_link; const uid = j?.data?.page_request_uid;
  if (j?.results?.status !== 'success' || !link || !uid) throw new Error('PayPlus generateLink: ' + (j?.results?.description || 'no link'));
  return { link: String(link), uid: String(uid) };
}

/** the "hash" header = base64 HMAC-SHA256 of the JSON body, keyed with the secret key; user-agent "PayPlus" */
export function verifyCallback(raw: string, headers: Headers) {
  const secret = env('PAYPLUS_SECRET_KEY'); const got = headers.get('hash') || '';
  if (!secret || !got || headers.get('user-agent') !== 'PayPlus') return false;
  const sig = (s: string) => crypto.createHmac('sha256', secret).update(s).digest('base64');
  const eq = (a: string) => { const x = Buffer.from(a), y = Buffer.from(got); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  if (eq(sig(raw))) return true;
  try { return eq(sig(JSON.stringify(JSON.parse(raw)))); } catch { return false; }
}

// deep search, because PayPlus nests the transaction differently in the callback and in the IPN answer
function find(o: any, keys: string[], depth = 0): any {
  if (!o || typeof o !== 'object' || depth > 5) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  for (const v of Object.values(o)) { const r = find(v, keys, depth + 1); if (r !== undefined) return r; }
  return undefined;
}
export type PayPlusTx = { approved: boolean; amount: number | null; orderId: number | null; reference: string; requestUid: string };
export function readTx(j: any): PayPlusTx {
  const code = String(find(j, ['status_code']) ?? '');
  const status = String(find(j, ['status']) ?? '').toLowerCase();
  return {
    approved: code === '000' && status !== 'rejected' && status !== 'error',
    amount: Number(find(j, ['amount'])) || null,
    orderId: +String(find(j, ['more_info']) ?? '') || null,
    reference: String(find(j, ['approval_number', 'voucher_number', 'number', 'transaction_uid', 'uid']) ?? ''),
    requestUid: String(find(j, ['payment_page_request_uid', 'page_request_uid']) ?? ''),
  };
}
/** ask PayPlus for the final state of a payment page (the only source we trust) */
export async function queryPayment(pageRequestUid: string) {
  const j = await call('PaymentPages/ipn', { payment_request_uid: pageRequestUid });
  return readTx(j);
}

/** confirm with PayPlus and mark the order paid; returns what happened */
export async function settleOrder(orderId: number): Promise<'paid' | 'already' | 'pending' | 'mismatch' | 'none'> {
  const { db } = await import('./db'); const { completeOrder } = await import('./orders');
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || !o.payRequestUid) return 'none';
  if (o.paymentStatus === 'completed') return 'already';
  const tx = await queryPayment(o.payRequestUid);
  if (!tx.approved) return 'pending';
  if (tx.orderId && tx.orderId !== o.id) return 'mismatch';
  if (tx.amount === null || Math.abs(tx.amount - Number(o.total)) > 0.01) {
    await db.order.update({ where: { id: o.id }, data: { importWarning: `PayPlus: סכום ששולם ${tx.amount} שונה מסכום ההזמנה – לבדיקה ידנית` } });
    return 'mismatch';
  }
  await completeOrder(o.id, `PayPlus ${tx.reference}`.trim());
  return 'paid';
}
