export default function robots() {
  if (process.env.STAGING === '1') return { rules: [{ userAgent: '*', disallow: '/' }] };
  const site = process.env.SITE_URL || 'https://www.greentec.co.il';
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/cart', '/checkout', '/account'] }], sitemap: `${site}/sitemap.xml` };
}
