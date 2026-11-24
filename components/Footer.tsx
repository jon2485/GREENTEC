import parts from './template-parts.json';
import { db } from '@/lib/db';

export default async function Footer() {
  const [pages, cats, sups] = await Promise.all([
    db.page.findMany({ where: { active: true } }),
    db.category.findMany({ select: { name: true, url: true } }),
    db.supplier.findMany({ select: { id: true, name: true, url: true } }),
  ]);
  const norm = (t: string) => t.replace(/[\s"'׳״-]/g, '').replace(/יי/g, 'י');
  const catUrl = (n: string) => { const c = cats.find((x) => x.name.trim() === n) || cats.find((x) => norm(x.name) === norm(n)) || cats.find((x) => x.url === n.replace(/\s+/g, '-')); return c?.url ? '/' + encodeURI(c.url) : ''; };
  const supUrl = (n: string) => { const c = sups.find((x) => x.name.trim() === n) || sups.find((x) => norm(x.name) === norm(n)) || sups.find((x) => norm(x.name).includes(norm(n)) || (norm(n).length > 6 && norm(n).includes(norm(x.name)) && norm(x.name).length > 6)); return c ? (c.url ? '/' + encodeURI(c.url) : `/ProductSuppliers/id/${c.id}`) : ''; };
  // the template's social icons, in order: Facebook, YouTube, Twitter (X), WhatsApp – the shop's real profiles
  const social = [
    ['https://www.facebook.com/%D7%92%D7%A8%D7%99%D7%A0%D7%98%D7%A7-Greentec-277363225649630/', 'גרינטק בפייסבוק'],
    ['https://www.youtube.com/user/GreentecVideos', 'גרינטק ביוטיוב'],
    ['https://twitter.com/Greentec8', 'גרינטק בטוויטר'],
    ['https://wa.me/972508666800', 'שליחת הודעת וואטסאפ לגרינטק'],
  ];
  const byTitle = (t: string) => pages.find((p) => p.title.trim().startsWith(t));
  const map: Record<string, string> = {
    'תקנון': byTitle('תקנון')?.url, 'מדריך הורדות דיגיטליות': byTitle('מדריך הורדות')?.url, 'אודות': byTitle('אודות')?.url,
    'שיטות משלוח': byTitle('שיטות משלוח')?.url, 'מדיניות פרטיות': byTitle('מדיניות הגנת')?.url, 'מדיניות החזרות': byTitle('מדיניות החזרת')?.url,
  } as any;
  let html = (parts as any).footer.replace(/\.\/assets\//g, '/t/assets/');
  let si = 0;
  html = html.replace(/<a href="#" class="inline-block social-link">/g, (m: string) => { const x = social[si++]; return x ? `<a href="${x[0]}" class="inline-block social-link" target="_blank" rel="noopener" aria-label="${x[1]}">` : m; });
  html = html.replace(/<img src="\/t\/assets\/images\/logo\.png" alt="">/, '<img src="/t/assets/images/logo.png" alt="גרינטק - מוזיקה ותוכן יהודי" width="110" height="100" loading="lazy">');
  html = html.replace(/<a href="#" class="contact-item">(\s*)<span class="contact-value">([^<]+)<\/span>/g, (m: string, ws: string, label: string) => {
    const url = map[label.trim()];
    if (url) return `<a href="/${encodeURI(url)}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    const t = label.trim();
    const internal = t === 'צור קשר' ? '/contact' : /כניסת אמנים/.test(t) ? '/account' : catUrl(t) || supUrl(t);
    if (internal) return `<a href="${internal}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    if (label.includes('@')) return `<a href="mailto:${label.trim()}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    if (/^[\d-]+$/.test(label.trim())) return `<a href="tel:${label.replace(/-/g, '')}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    return m;
  });
  // contact rows with an icon: e-mail, phone, opening hours, free shipping
  const ship = byTitle('שיטות משלוח')?.url;
  html = html.replace(/<a href="#" class="contact-item">(\s*<svg[\s\S]*?<\/svg>\s*)<span class="contact-value([^"]*)">([^<]+)<\/span>/g, (m: string, icon: string, cls: string, label: string) => {
    const t = label.trim();
    const to = t.includes('@') ? `mailto:${t}` : /^[\d-]+$/.test(t) ? `tel:+972${t.replace(/-/g, '').replace(/^0/, '')}` : /משלוח/.test(t) && ship ? '/' + encodeURI(ship) : /בימים|שעות/.test(t) ? '/contact' : '';
    return to ? `<a href="${to}" class="contact-item">${icon}<span class="contact-value${cls}">${label}</span>` : m;
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
