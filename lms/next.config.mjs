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
  reactStrictMode: true
};

export default nextConfig;

