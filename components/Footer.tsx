import parts from './template-parts.json';
import { db } from '@/lib/db';

export default async function Footer() {
  const pages = await db.page.findMany({ where: { active: true } });
  const byTitle = (t: string) => pages.find((p) => p.title.trim().startsWith(t));
  const map: Record<string, string> = {
    'תקנון': byTitle('תקנון')?.url, 'מדריך הורדות דיגיטליות': byTitle('מדריך הורדות')?.url, 'אודות': byTitle('אודות')?.url,
    'שיטות משלוח': byTitle('שיטות משלוח')?.url, 'מדיניות פרטיות': byTitle('מדיניות הגנת')?.url, 'מדיניות החזרות': byTitle('מדיניות החזרת')?.url,
  } as any;
  let html = (parts as any).footer.replace(/\.\/assets\//g, '/t/assets/');
  html = html.replace(/<a href="#" class="contact-item">(\s*)<span class="contact-value">([^<]+)<\/span>/g, (m: string, ws: string, label: string) => {
    const url = map[label.trim()];
    if (url) return `<a href="/${encodeURI(url)}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    if (label.includes('@')) return `<a href="mailto:${label.trim()}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    if (/^[\d-]+$/.test(label.trim())) return `<a href="tel:${label.replace(/-/g, '')}" class="contact-item">${ws}<span class="contact-value">${label}</span>`;
    return m;
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
