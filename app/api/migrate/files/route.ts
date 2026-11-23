// GET /api/migrate/files?token=… → which products already have a digital file (to skip) and which still need one.
import { db } from '@/lib/db';
import { json, preflight, tokenOk, tokenFrom } from '@/lib/migrate';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function GET(req: Request) {
  if (!tokenOk(tokenFrom(req))) return json(req, { error: 'unauthorized' }, 401);
  const rows = await db.product.findMany({ where: { NOT: { digitalFile: '' } }, select: { id: true, digitalFile: true } });
  const done = new Set(rows.map((r) => r.id));
  let legacy: number[] = [];
  const p = join(process.cwd(), 'data', 'legacy-admin-full.json.gz');
  if (existsSync(p)) legacy = (JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')).products || []).filter((x: any) => x.hasFile).map((x: any) => x.id);
  return json(req, { done: [...done].sort((a, b) => a - b), need: legacy.filter((id) => !done.has(id)).sort((a, b) => a - b), files: Object.fromEntries(rows.map((r) => [r.id, r.digitalFile])) });
}
