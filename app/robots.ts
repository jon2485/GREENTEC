export default function robots() {
  if (process.env.STAGING === '1') return { rules: [{ userAgent: '*', disallow: '/' }] };
  const site = (process.env.SITE_URL || 'https://www.greentec.co.il').replace(/\/$/, '');
  return {
    rules: [{
      userAgent: '*', allow: '/',
      // private / transactional pages, and endless filter combinations (they carry noindex too)
      disallow: ['/admin', '/api/', '/cart', '/checkout', '/account', '/pay/', '/login', '/signup', '/forgot-password', '/reset-password', '/*?*min=', '/*?*max=', '/*?*sup=', '/*?*per=', '/*?*view='],
    }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
