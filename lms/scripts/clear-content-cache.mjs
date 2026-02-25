/**
 * What this file does
 * - Deletes the server-side extraction cache for `.h5p` packages.
 *
 * Why this exists (plain English)
 * - For MVP, the LMS extracts each `.h5p` ZIP into `/content/_extracted/<moduleId>/...`
 *   so it can be embedded by the H5P runtime.
 * - If you replace a `.h5p` file with a newer version, you sometimes want to wipe the
 *   extracted folder so the LMS re-extracts it on next launch.
 *
 * How it works
 * - With no args: deletes `/content/_extracted` (all extracted modules)
 * - With 1 arg: deletes `/content/_extracted/<moduleId>` (one module)
 *
 * Examples
 * - Clear everything:
 *   - `npm run content:clear-cache`
 * - Clear one module:
 *   - `npm run content:clear-cache -- patch-or-pause`
 *
 * Safety notes
 * - This script ONLY deletes inside the resolved `/content/_extracted` directory.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

function getContentRoot() {
  // Mirrors `src/lib/content.ts#getContentRoot()` (duplicated here so this is a standalone script).
  const fromEnv = process.env.CONTENT_DIR?.trim();
  if (fromEnv) {
    const resolved = path.resolve(process.cwd(), fromEnv);
    if (fsSync.existsSync(resolved)) return resolved;
  }

  const candidate1 = path.resolve(process.cwd(), "..", "content");
  if (fsSync.existsSync(candidate1)) return candidate1;

  return path.resolve(process.cwd(), "content");
}

async function main() {
  const contentRoot = getContentRoot();
  const extractedRoot = path.resolve(contentRoot, "_extracted");

  const moduleId = process.argv[2]?.trim() || null;
  const target = moduleId ? path.resolve(extractedRoot, moduleId) : extractedRoot;

  // Safety: refuse to delete anything outside `_extracted`.
  const relative = path.relative(extractedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to delete outside the /content/_extracted cache folder.");
  }

  await fs.rm(target, { recursive: true, force: true });

  // eslint-disable-next-line no-console
  console.log(
    `[content:clear-cache] Cleared: ${moduleId ? `${extractedRoot}/${moduleId}` : extractedRoot}`
  );
}

await main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[content:clear-cache] Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

