/**
 * What this file does
 * - Creates a tiny "stub" middleware manifest file that Next.js expects to exist:
 *   `.next/server/middleware-manifest.json`
 *
 * Why this exists (plain English)
 * - Sometimes (usually after interrupted builds, tool crashes, or partially-cleared caches),
 *   Next.js dev can start up with a half-created `.next/` folder.
 * - When that happens, Next's dev server may crash with:
 *   "Cannot find module .../.next/server/middleware-manifest.json"
 * - This script prevents that crash by ensuring the file exists.
 *
 * Important note
 * - This does NOT replace a real middleware build. It's safe for this MVP because we do
 *   not use `middleware.ts` or Edge Functions.
 * - If you later add middleware, you can remove this helper (or keep it—Next will
 *   overwrite the manifest during a normal build).
 *
 * How it works
 * - Ensures `.next/server/` exists.
 * - Writes a minimal JSON manifest if missing.
 */

import fs from "node:fs/promises";
import path from "node:path";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const nextDir = path.resolve(process.cwd(), ".next");
  const serverDir = path.join(nextDir, "server");
  const manifestPath = path.join(serverDir, "middleware-manifest.json");

  await fs.mkdir(serverDir, { recursive: true });

  if (await exists(manifestPath)) return;

  const minimalManifest = {
    // Matches Next's `MiddlewareManifest` type (Next 14+)
    version: 3,
    sortedMiddleware: [],
    middleware: {},
    functions: {}
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(minimalManifest, null, 2)}\n`, "utf8");

  // eslint-disable-next-line no-console
  console.log(`[next:ensure-manifests] Wrote stub: ${manifestPath}`);
}

await main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[next:ensure-manifests] Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

