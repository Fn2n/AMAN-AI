/**
 * STATIC_EXPORT=1 builds a fully static site into ./out (used for GitHub Pages).
 * BASE_PATH is the sub-path the site is served from, e.g. "/aman-ai" for
 * https://<user>.github.io/aman-ai/. Leave both unset for normal `npm run dev` / `npm start`.
 * @type {import('next').NextConfig}
 */
const isStatic = process.env.STATIC_EXPORT === '1';
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Public, non-secret build flags only. GEMINI_API_KEY is deliberately NOT listed here.
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isStatic ? '1' : '0',
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  ...(isStatic
    ? {
        output: 'export',
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath || undefined,
      }
    : {}),
};

export default nextConfig;
