import fs from "node:fs/promises";
import { CYBER_CRUSH_LEVELS, type CyberCrushLevelPresentation } from "@/lib/cyberCrushLevelData";
import { resolveContentPath } from "@/lib/content";

/**
 * What this file does
 * - Resolves Cyber Crush icon files from the repo-level `/content` folder.
 *
 * Why this exists (plain English)
 * - The user asked for assets to live under:
 *   `content/cyber-crush/icons/`
 * - We want the game to use those real files when they exist,
 *   but gracefully fall back to labeled tiles when they do not.
 *
 * How it works
 * - Each tile definition in `cyberCrushLevelData.ts` includes an `assetPath`.
 * - We check whether that file exists on disk under `/content`.
 * - If it exists, we expose `/api/content/<assetPath>`.
 * - If it does not, we return `iconUrl: null`, which the UI treats as a safe fallback.
 *
 * How to change it
 * - Keep the filenames in sync with the files placed in `content/cyber-crush/icons/`.
 */

async function contentFileExists(assetPath: string) {
  const resolved = resolveContentPath(assetPath.split("/"));
  if (!resolved) return false;

  try {
    const stat = await fs.stat(resolved);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function loadCyberCrushLevelsWithAssets(): Promise<CyberCrushLevelPresentation[]> {
  return Promise.all(
    CYBER_CRUSH_LEVELS.map(async (level) => ({
      ...level,
      tiles: await Promise.all(
        level.tiles.map(async (tile) => ({
          ...tile,
          iconUrl: (await contentFileExists(tile.assetPath)) ? `/api/content/${tile.assetPath}` : null
        }))
      )
    }))
  );
}

