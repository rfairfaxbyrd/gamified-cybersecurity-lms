/**
 * What this file does
 * - Configures Next.js for this project.
 *
 * Key concepts
 * - For MVP we keep config minimal and rely on Next defaults.
 *
 * How it works
 * - Next.js loads this at build/start time.
 *
 * How to change it
 * - Add rewrites/headers here (e.g., if you later host /content on a CDN).
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Experimental options (kept minimal).
   *
   * Why this exists
   * - Some environments occasionally hit non-deterministic dev/build artifacts where
   *   server vendor chunks go missing (e.g. `vendor-chunks/next-auth.js`).
   * - Marking `next-auth` as an external package for the Server Components build
   *   reduces the amount of server bundling Next needs to do and makes builds/dev
   *   more robust for this MVP.
   *
   * Safety
   * - This does not change how your app code calls NextAuth; it only changes how
   *   Next.js bundles it.
   */
  experimental: {
    serverComponentsExternalPackages: ["next-auth"]
  }
};

export default nextConfig;
