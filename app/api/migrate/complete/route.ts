// POST /api/migrate/complete {token, productId, key, uploadId?, parts?:[{PartNumber, ETag}]}
// → completes a multipart upload (if any), checks the object exists and sets Product.digitalFile.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody } from '@/lib/migrate';
import { multipartComplete, exists } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function POST(req: Request) {
  const b = await readBody(req);
  if (!tokenOk(tokenFrom(req, b))) return json(req, { error: 'unauthorized' }, 401);
  const productId = Number(b.productId); const key = String(b.key || '');
  if (!productId || !key.startsWith(`products/${productId}/`) || key.includes('..')) return json(req, { error: 'bad key' }, 400);
  if (b.uploadId) {
    const parts = typeof b.parts === 'string' ? JSON.parse(b.parts) : b.parts;
    if (!Array.isArray(parts) || !parts.length) return json(req, { error: 'parts missing' }, 400);
    await multipartComplete(key, String(b.uploadId), parts.map((p: any) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag) })));
  }
  if (!(await exists(key))) return json(req, { error: 'object not found in bucket' }, 409);
  await db.product.update({ where: { id: productId }, data: { digitalFile: key } });
  return json(req, { ok: true, productId, key });
}
