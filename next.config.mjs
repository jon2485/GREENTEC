/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // Railway installs without devDependencies (no TypeScript at build time), so types are checked with `npm run typecheck` instead
  typescript: { ignoreBuildErrors: true },
  output: undefined,
  // trailing slashes are handled in middleware.ts: everything → without the slash, except the legacy /articles/ (its canonical)
  skipTrailingSlashRedirect: true,
  // noindex on staging is set at runtime only (middleware.ts): a build-time header would survive into production
  // if the go-live build were made with STAGING=1 – that must never happen.

};
export default nextConfig;
