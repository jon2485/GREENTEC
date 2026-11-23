// Part D – temporary endpoints that receive the ≈100 GB of digital files, uploaded from the owner's logged-in
// browser on www.greentec.co.il straight into the bucket. Protected by MIGRATION_TOKEN (Railway variable).
// TODO(after migration): delete app/api/migrate/* and this file, and remove MIGRATION_TOKEN.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const MIGRATE_ORIGINS = ['https://www.greentec.co.il', 'https://greentec.co.il'];
export function cors(req: Request, res: NextResponse) {
  const o = req.headers.get('origin') || '';
  if (MIGRATE_ORIGINS.includes(o)) {
    res.headers.set('Access-Control-Allow-Origin', o);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Migration-Token');
    res.headers.set('Access-Control-Max-Age', '3600');
  }
  return res;
}
export const preflight = (req: Request) => cors(req, new NextResponse(null, { status: 204 }));
export const json = (req: Request, body: any, status = 200) => cors(req, NextResponse.json(body, { status }));

export function tokenOk(given: string | null | undefined) {
  const t = process.env.MIGRATION_TOKEN || '';
  if (t.length < 16 || !given) return false;
  const a = Buffer.from(t), b = Buffer.from(String(given));
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function readBody(req: Request): Promise<any> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return req.json().catch(() => ({}));
  const f = await req.formData().catch(() => null); return f ? Object.fromEntries(f) : {};
}
export const tokenFrom = (req: Request, body?: any) => req.headers.get('x-migration-token') || body?.token || new URL(req.url).searchParams.get('token');
export const safeName = (n: string) => String(n || 'file').normalize('NFC').replace(/[\\/:*?"<>|#%\x00-\x1f]+/g, '_').replace(/\s+/g, '_').slice(-150) || 'file';
