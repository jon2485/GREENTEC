// POST /api/migrate/upload-url {token, productId, filename, size, contentType?}
// → {key, url} for a single PUT, or {key, uploadId, partSize, parts, urls[]} for multipart (> 64 MB).
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom, readBody, safeName } from '@/lib/migrate';
import { storageReady, signedUpload, multipartStart, multipartPartUrls } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
const MB = 1024 * 1024;
export async function POST(req: Request) {
  const b = await readBody(req);
  if (!tokenOk(tokenFrom(req, b))) return json(req, { error: 'unauthorized' }, 401);
  if (!storageReady()) return json(req, { error: 'bucket not configured' }, 503);
  const productId = Number(b.productId); const size = Number(b.size || 0); const type = String(b.contentType || 'application/octet-stream');
  if (!productId || !(await db.product.findUnique({ where: { id: productId }, select: { id: true } }))) return json(req, { error: 'unknown product' }, 404);
  const key = `products/${productId}/${safeName(b.filename)}`;
  if (size > 64 * MB) {
    const partSize = Math.max(16 * MB, Math.ceil(size / 9000 / MB) * MB);
    const parts = Math.ceil(size / partSize);
    const uploadId = await multipartStart(key, type);
    return json(req, { key, multipart: true, uploadId, partSize, parts, urls: await multipartPartUrls(key, uploadId, 1, parts, 12 * 3600) });
  }
  return json(req, { key, multipart: false, url: await signedUpload(key, type, 6 * 3600), contentType: type });
}
