/**
 * What this file does
 * - Deletes the local Next.js build/dev cache folder: `lms/.next`.
 *
 * Why this exists (plain English)
 * - Next.js stores build artifacts in `.next/`.
 * - If you interrupt `next build` or a dev compile, the `.next/` folder can end up in a
 *   partially-written state. That can cause confusing errors like:
 *   - "Cannot find module .../.next/server/middleware-manifest.json"
 * - Clearing `.next/` forces Next.js to rebuild it from scratch on the next run.
 *
 * How it works
 * - Deletes ONLY the `.next` folder in the current working directory (expected: `lms/`).
 *
 * Examples
 * - `cd lms`
 * - `npm run next:clear-cache`
 */

import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const nextDir = path.resolve(process.cwd(), ".next");
  await fs.rm(nextDir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`[next:clear-cache] Cleared: ${nextDir}`);
}

await main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[next:clear-cache] Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

