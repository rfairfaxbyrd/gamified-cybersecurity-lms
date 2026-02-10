import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import extractZip from "extract-zip";

/**
 * What this file does
 * - Defines where training content lives on disk.
 * - Includes an optional helper to extract `.h5p` packages so they can be embedded.
 *
 * Key concepts (plain English)
 * - Your interactive modules live in a repository-level `/content` folder.
 * - The app serves these files through an API route for safety + flexibility.
 *
 * How it works
 * - `CONTENT_DIR` (env) can override the content folder location.
 * - Default is `../content` relative to the Next.js app folder (`/lms`).
 *
 * How to change it
 * - Point `CONTENT_DIR` to a mounted volume when running in Docker.
 */

export function getContentRoot() {
  // process.cwd() is expected to be `/lms` when running `npm run dev` from that folder.
  // However, some workflows run Next from the repo root. We provide a safe fallback.
  const fromEnv = process.env.CONTENT_DIR?.trim();
  if (fromEnv) return path.resolve(process.cwd(), fromEnv);

  const candidate1 = path.resolve(process.cwd(), "..", "content");
  if (fsSync.existsSync(candidate1)) return candidate1;

  // Fallback: if the app was launched from the repo root, `./content` is correct.
  return path.resolve(process.cwd(), "content");
}

/**
 * Safely resolves a requested URL path into a file-system path under /content.
 * This prevents path traversal (e.g., someone requesting ../../etc/passwd).
 */
export function resolveContentPath(pathSegments: string[]) {
  const contentRoot = getContentRoot();

  // Normalize / decode segments and disallow "..".
  const safeSegments = pathSegments
    .filter((seg) => seg.length > 0)
    .map((seg) => decodeURIComponent(seg))
    .map((seg) => seg.replaceAll("\\", "/"));

  if (safeSegments.some((seg) => seg === "." || seg === ".." || seg.includes("../"))) {
    return null;
  }

  const candidate = path.resolve(contentRoot, ...safeSegments);

  // Safer "is this path inside contentRoot?" check than `startsWith(...)`.
  const relative = path.relative(contentRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return candidate;
}

/**
 * Extracts a `.h5p` package into `/content/_extracted/<moduleId>/...` so the browser
 * can embed it via the `h5p-standalone` runtime.
 *
 * MVP assumptions
 * - This is designed for self-hosted Node environments (homelab / Docker).
 * - For serverless platforms, writing to disk may not be allowed.
 */
export async function ensureH5PExtracted(opts: {
  moduleId: string;
  h5pLaunchPath: string;
}) {
  const contentRoot = getContentRoot();
  if (!opts.h5pLaunchPath.toLowerCase().endsWith(".h5p")) {
    throw new Error("H5P extraction requires a .h5p launchPath.");
  }
  const source = resolveContentPath([opts.h5pLaunchPath]);
  if (!source) throw new Error("Invalid H5P path.");

  // Helpful early validations so errors are actionable.
  try {
    const stat = await fs.stat(contentRoot);
    if (!stat.isDirectory()) {
      throw new Error(`Content root is not a folder: ${contentRoot}`);
    }
  } catch {
    throw new Error(
      `Content folder not found. Set CONTENT_DIR to your repo-root /content folder. (Tried: ${contentRoot})`
    );
  }

  try {
    const stat = await fs.stat(source);
    if (!stat.isFile()) throw new Error("Not a file");
  } catch {
    throw new Error(
      `H5P file not found at ${source}. Check your CONTENT_DIR setting and that the .h5p exists in /content.`
    );
  }

  const baseExtractedDir = path.resolve(contentRoot, "_extracted", opts.moduleId);

  async function pathExists(p: string) {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async function findFileRecursive(params: {
    rootDir: string;
    filename: string;
    maxDepth: number;
  }): Promise<string | null> {
    const { rootDir, filename, maxDepth } = params;
    if (maxDepth < 0) return null;

    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(rootDir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const full = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return full;
      if (entry.isDirectory()) {
        const found = await findFileRecursive({
          rootDir: full,
          filename,
          maxDepth: maxDepth - 1
        });
        if (found) return found;
      }
    }

    return null;
  }

  function urlPathFromAbsoluteDir(absoluteDir: string) {
    const relative = path.relative(contentRoot, absoluteDir);
    // Normalize Windows paths just in case.
    const normalized = relative.split(path.sep).join("/");
    return `/${normalized}`;
  }

  // 1) If we've already extracted, locate h5p.json (root or nested).
  const directMarker = path.join(baseExtractedDir, "h5p.json");
  if (await pathExists(directMarker)) {
    return {
      extractedDir: baseExtractedDir,
      extractedUrlPath: urlPathFromAbsoluteDir(baseExtractedDir)
    };
  }

  const existingNested = await findFileRecursive({
    rootDir: baseExtractedDir,
    filename: "h5p.json",
    maxDepth: 4
  });
  if (existingNested) {
    const h5pRoot = path.dirname(existingNested);
    return { extractedDir: h5pRoot, extractedUrlPath: urlPathFromAbsoluteDir(h5pRoot) };
  }

  // 2) Extract fresh.
  await fs.mkdir(path.dirname(baseExtractedDir), { recursive: true });
  await fs.rm(baseExtractedDir, { recursive: true, force: true });
  await fs.mkdir(baseExtractedDir, { recursive: true });

  try {
    // `.h5p` files are ZIP archives under the hood.
    await extractZip(source, { dir: baseExtractedDir });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to unzip H5P package. (${msg})`);
  }

  // 3) Locate h5p.json after extraction (supports packages that contain a top-level folder).
  const extractedNested = await findFileRecursive({
    rootDir: baseExtractedDir,
    filename: "h5p.json",
    maxDepth: 4
  });

  if (!extractedNested) {
    // Common mistake: exporting SCORM ZIP and renaming it to .h5p.
    const hasScormManifest = await findFileRecursive({
      rootDir: baseExtractedDir,
      filename: "imsmanifest.xml",
      maxDepth: 3
    });

    if (hasScormManifest) {
      throw new Error(
        "This file looks like a SCORM package (imsmanifest.xml). Export the original .h5p from Lumi (not SCORM) to embed with H5P, or unzip the SCORM package and set launchType=HTML."
      );
    }

    throw new Error(
      "Extracted archive did not contain h5p.json. This does not appear to be a valid .h5p package."
    );
  }

  const h5pRoot = path.dirname(extractedNested);
  return { extractedDir: h5pRoot, extractedUrlPath: urlPathFromAbsoluteDir(h5pRoot) };
}

/**
 * Detects whether a given `launchPath` appears to be part of a SCORM package.
 *
 * Why this exists
 * - For the MVP, we store `launchType` as a simple string ("HTML", "H5P", etc.).
 * - Many people export SCORM from tools like Lumi. A SCORM package is essentially
 *   "an HTML folder" plus a manifest file named `imsmanifest.xml`.
 * - We use this helper to auto-enable the SCORM API bridge even when a module
 *   is configured as `launchType = "HTML"`.
 *
 * How it works
 * - Resolve `launchPath` under /content.
 * - Check the containing folder (and up to a few parents) for `imsmanifest.xml`.
 */
export async function looksLikeScormLaunchPath(launchPath: string) {
  const contentRoot = getContentRoot();
  const resolved = resolveContentPath([launchPath]);
  if (!resolved) return false;

  let dir = resolved;
  try {
    const stat = await fs.stat(resolved);
    if (stat.isFile()) dir = path.dirname(resolved);
  } catch {
    return false;
  }

  // Search a few levels upward for imsmanifest.xml.
  // This covers packages where the launch HTML is nested but the manifest lives at the root.
  for (let i = 0; i < 4; i += 1) {
    const manifest = path.join(dir, "imsmanifest.xml");
    try {
      await fs.access(manifest);
      return true;
    } catch {
      // keep searching
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;

    // Stop if we would leave the content root.
    const relative = path.relative(contentRoot, parent);
    if (relative.startsWith("..") || path.isAbsolute(relative)) break;

    dir = parent;
  }

  return false;
}
