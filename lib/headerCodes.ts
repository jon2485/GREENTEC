// Turns the legacy "header codes" (GTM / gtag snippets saved in admin → מערכת → headers) into React script tags.
// Only active in production: staging must not send analytics hits.
type Tag = { src?: string; async?: boolean; code?: string };
export function parseScripts(html: string): Tag[] {
  const out: Tag[] = [];
  for (const m of (html || '').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = m[1].match(/src=["']([^"']+)["']/i)?.[1];
    if (src) out.push({ src, async: /\basync\b/i.test(m[1]) });
    else if (m[2].trim()) out.push({ code: m[2] });
  }
  return out;
}
export const trackingEnabled = () => process.env.STAGING !== '1';
