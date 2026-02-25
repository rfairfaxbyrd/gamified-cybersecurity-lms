/**
 * What this file does
 * - Ensures the `@prisma/client` package exists in `node_modules`.
 *
 * Why this exists (plain English)
 * - Prisma generates code into `node_modules/.prisma/client`, but that generated client
 *   still depends on runtime files from the `@prisma/client` package.
 * - After force-upgrades, rollbacks, or interrupted installs, you can end up with an
 *   *empty* `node_modules/@prisma/client` folder. Then Next.js/Node can't resolve it and
 *   the app fails to start/build.
 *
 * How it works
 * - If `node_modules/@prisma/client/package.json` exists, do nothing.
 * - Otherwise, copy the bundled `@prisma/client` package that ships inside
 *   `node_modules/prisma/prisma-client` into `node_modules/@prisma/client`.
 *
 * How to use it
 * - This script is run automatically before `prisma generate` via npm scripts.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function exists(p) {
  try {
    fsSync.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  await fs.cp(from, to, { recursive: true, force: true });
}

async function main() {
  const clientPkg = path.join(projectRoot, "node_modules", "@prisma", "client", "package.json");
  if (exists(clientPkg)) return;

  const bundledClientDir = path.join(projectRoot, "node_modules", "prisma", "prisma-client");
  const bundledPkg = path.join(bundledClientDir, "package.json");
  if (!exists(bundledPkg)) {
    throw new Error(
      "Cannot repair @prisma/client because `node_modules/prisma/prisma-client` is missing. Run `npm install` first."
    );
  }

  const destDir = path.join(projectRoot, "node_modules", "@prisma", "client");
  await copyDir(bundledClientDir, destDir);

  // eslint-disable-next-line no-console
  console.log("[prisma] Repaired missing @prisma/client from prisma's bundled copy.");
}

await main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[prisma] ensure-prisma-client failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

