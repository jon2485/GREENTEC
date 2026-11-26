/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // Railway installs without devDependencies (no TypeScript at build time), so types are checked with `npm run typecheck` instead
  typescript: { ignoreBuildErrors: true },
  output: undefined,
  async headers() {
    return process.env.STAGING === '1'
      ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
      : [];
  },
};
export default nextConfig;
