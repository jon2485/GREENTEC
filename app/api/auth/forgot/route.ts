// "שכחתי סיסמה": e-mails a one-time link valid for 1 hour. The answer is the same whether or not the e-mail exists.
import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { sendMail } from '@/lib/mail';

const hits = new Map<string, number[]>(); // simple per-IP rate limit: 5 requests / 15 minutes
function limited(ip: string) { const now = Date.now(); const a = (hits.get(ip) || []).filter((t) => now - t < 15 * 60e3); a.push(now); hits.set(ip, a); return a.length > 5; }

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase();
  const back = (q: string) => NextResponse.redirect(new URL('/forgot-password?' + q, req.url), 303);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (limited(ip)) return back('err=rate');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return back('err=email');
  const u = await db.user.findUnique({ where: { email } });
  if (u && u.active) {
    const token = randomBytes(32).toString('base64url');
    await db.passwordReset.deleteMany({ where: { userId: u.id, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } });
    await db.passwordReset.create({ data: { userId: u.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600e3) } });
    const site = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
    const link = `${site}/reset-password?token=${token}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6"><p>שלום${u.name ? ' ' + u.name.replace(/[<>&]/g, '') : ''},</p><p>קיבלנו בקשה להגדיר סיסמה לחשבון שלך באתר גרינטק.</p><p><a href="${link}" style="display:inline-block;background:#cadb2d;color:#2a2b2c;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">הגדרת סיסמה חדשה</a></p><p style="font-size:13px;color:#666">הקישור בתוקף לשעה אחת. אם לא ביקשת זאת, אפשר להתעלם מההודעה.</p></div>`;
    await sendMail(email, 'הגדרת סיסמה – גרינטק', html, `להגדרת סיסמה חדשה: ${link} (בתוקף לשעה)`).catch(() => false);
  }
  return back('sent=1');
}
