/**
 * What this file does
 * - Copies vendor assets from certain npm packages into `/public` so they can be
 *   served by Next.js as static files.
 *
 * Why we need this (plain English)
 * - The H5P standalone runtime needs a "frame" JS + CSS file available at a URL.
 * - In Next.js, the easiest way is to put these files under `public/`.
 *
 * How it works
 * - Runs automatically after `npm install` (via package.json `postinstall`).
 * - Copies `node_modules/h5p-standalone/dist/*` to `public/vendor/h5p-standalone/*`.
 *
 * How to change it
 * - Add more copy steps if you later include other browser-only vendor assets.
 */

import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const projectRoot = process.cwd();
const execFileAsync = promisify(execFile);

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true, force: true });
}

async function main() {
  // 0) Repair a missing/empty `@prisma/client` install (common after interrupted installs).
  // Prisma bundles a copy of `@prisma/client` inside the `prisma` package, so we can
  // copy it locally without hitting the network.
  try {
    await execFileAsync(process.execPath, [path.join(projectRoot, "scripts", "ensure-prisma-client.mjs")], {
      cwd: projectRoot
    });
  } catch {
    // If this fails, Prisma generate below will still print a helpful warning.
  }

  // 1) Prisma client generation (prevents "@prisma/client did not initialize yet" runtime errors).
  // This does NOT require a database connection; it only needs the schema file.
  try {
    const prismaBin = path.join(
      projectRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "prisma.cmd" : "prisma"
    );
    await execFileAsync(prismaBin, ["generate"], { cwd: projectRoot });
    // eslint-disable-next-line no-console
    console.log("[postinstall] Prisma client generated.");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[postinstall] Warning: could not run `prisma generate`. If you see '@prisma/client did not initialize yet', run `npm run prisma:generate`."
    );
  }

  // 2) Vendor assets for the H5P embed runtime.
  const from = path.join(projectRoot, "node_modules", "h5p-standalone", "dist");
  const to = path.join(projectRoot, "public", "vendor", "h5p-standalone");

  try {
    await copyDir(from, to);
    // eslint-disable-next-line no-console
    console.log(`[postinstall] Copied h5p-standalone assets -> ${path.relative(projectRoot, to)}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[postinstall] Warning: could not copy h5p-standalone assets. H5P embeds may not render until you run `npm install` again."
    );
  }
}

await main();
