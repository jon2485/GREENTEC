import { cookies } from 'next/headers';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
export const ADMIN_TYPES = [69, 70, 99];

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hex] = (stored || '').split(':');
  if (alg !== 'scrypt' || !salt || !hex) return false;
  const a = scryptSync(pw, salt, 32); const b = Buffer.from(hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function sign(v: string) { return createHmac('sha256', SECRET).update(v).digest('hex'); }
export function makeToken(userId: number) { const v = `${userId}.${Date.now()}`; return `${v}.${sign(v)}`; }
export function readToken(t?: string) {
  if (!t) return null; const i = t.lastIndexOf('.'); const v = t.slice(0, i);
  if (sign(v) !== t.slice(i + 1)) return null; return Number(v.split('.')[0]) || null;
}
export async function currentUser() {
  const c = (await cookies()).get('gt_session')?.value;
  const id = readToken(c); if (!id) return null;
  return db.user.findUnique({ where: { id } });
}
export async function setSession(userId: number) {
  (await cookies()).set('gt_session', makeToken(userId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() { (await cookies()).delete('gt_session'); }
export async function requireAdmin() {
  const u = await currentUser();
  return u && ADMIN_TYPES.includes(u.type) ? u : null;
}
