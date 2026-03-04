/**
 * What this file does
 * - Runs the local Next.js CLI in a way that is resilient on machines where:
 *   - `node_modules/.bin` shims are not created (npm config `install-links=false`)
 *   - Next's lockfile auto-patch step crashes (known issue in some Next versions)
 *
 * Why this exists (plain English)
 * - We saw dev/build crashes like:
 *   - "Found lockfile missing swc dependencies, patching..."
 *   - "Failed to patch lockfile ..."
 * - For stability, we apply a small runtime patch to Next's lockfile auto-patcher (see below).
 *
 * How it works
 * - Spawns: `node node_modules/next/dist/bin/next <args...>`
 * - Sets `NEXT_TELEMETRY_DISABLED=1` unless you already set it.
 * - (If needed) patches Next's internal lockfile patcher to avoid a Next 14.2.35 crash.
 *
 * How to use it
 * - `node scripts/run-next.mjs dev`
 * - `node scripts/run-next.mjs build`
 * - `node scripts/run-next.mjs start`
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const args = process.argv.slice(2);
if (args.length === 0) {
  // eslint-disable-next-line no-console
  console.error("[run-next] Missing args. Example: node scripts/run-next.mjs dev");
  process.exit(1);
}

const command = args[0];

const env = {
  ...process.env,
  // Keep CI/dev output clean.
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1"
};

/**
 * Patch Next.js's lockfile auto-patcher (Next 14.2.35 bug)
 *
 * Why this exists (plain English)
 * - Next.js tries to auto-patch `package-lock.json` when it detects missing `@next/swc-*`
 *   optional dependencies.
 * - In Next.js 14.2.35, that patcher looks up SWC package metadata using the *Next* version
 *   (14.2.35) even though the SWC packages are pinned to 14.2.33 in Next's `optionalDependencies`.
 * - Result: dev/build logs show a crash like:
 *     "TypeError: Cannot read properties of undefined (reading 'os')"
 * - This patch makes the auto-patcher use the SWC package version from `optionalDependencies`
 *   and avoids that crash.
 *
 * Safety
 * - This edits a file inside `node_modules/next/...` at runtime.
 * - If Next changes the file format in a future upgrade, we detect that and skip patching.
 */
async function patchNextLockfilePatcher() {
  const patcherPath = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "lib",
    "patch-incorrect-lockfile.js"
  );

  let contents;
  try {
    contents = await fs.readFile(patcherPath, "utf8");
  } catch {
    return;
  }

  if (contents.includes("__GCLMS_SWC_PATCH__")) return;

  const needle = "const versionData = data.versions[_packagejson.default.version];";
  const returnNeedle = "return {\n        os: versionData.os,";
  const versionNeedle = "version: _packagejson.default.version,";

  // If Next changes this internal file in a future upgrade, we skip patching safely.
  if (!contents.includes(needle) || !contents.includes(returnNeedle) || !contents.includes(versionNeedle)) return;

  let next = contents;
  next = next.replace(
    needle,
    [
      // Pick the version Next itself declares for this optional dependency (usually 14.2.33).
      "const desiredVersion = ((_packagejson.default.optionalDependencies || {})[pkg]) ?? _packagejson.default.version;",
      "const versionData = data.versions[desiredVersion];",
      "if (!versionData) {",
      "    throw new Error(`Failed to find registry info for ${pkg}@${desiredVersion}`);",
      "}"
    ].join("\n    ")
  );

  // Include the desired version in the returned pkg data so lockfile entries are consistent.
  next = next.replace(
    returnNeedle,
    "return {\n        version: desiredVersion,\n        os: versionData.os,"
  );

  // When patching package-lock entries, use the SWC package's version (not Next's version).
  next = next.replaceAll(versionNeedle, "version: pkgData.version,");

  if (next === contents) return;

  // Marker so we don't patch repeatedly.
  next = `// __GCLMS_SWC_PATCH__\n${next}`;

  try {
    await fs.writeFile(patcherPath, next, "utf8");
  } catch {
    // If we can't write (permissions), Next will still run; it may just print the warning.
  }
}

// Extra safety for dev mode:
// Some interrupted builds can leave `.next/` in a state where Next tries to require a
// missing middleware manifest file. We create a tiny stub ahead of time so dev can boot.
if (command === "dev") {
  try {
    execFileSync(process.execPath, [path.join(projectRoot, "scripts", "ensure-next-manifests.mjs")], {
      cwd: projectRoot,
      stdio: "inherit",
      env
    });
  } catch {
    // If this fails, Next may still start normally; it will print a useful error if not.
  }
}

await patchNextLockfilePatcher();

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: "inherit",
  env
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
