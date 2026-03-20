import crypto from "node:crypto";
import { Card } from "@/components/ui/card";
import { CyberCrushGame } from "@/components/CyberCrushGame";
import { loadCyberCrushLevelsWithAssets } from "@/lib/cyberCrushAssetLoader";

/**
 * What this file does
 * - Exposes Cyber Crush as a native Next.js module page so it can run:
 *   1) standalone in the browser
 *   2) embedded inside the LMS module player iframe
 *
 * How the content-folder asset loading works
 * - Icon metadata lives in `src/lib/cyberCrushLevelData.ts`
 * - This page asks `src/lib/cyberCrushAssetLoader.ts` to check which icon files
 *   actually exist under `content/cyber-crush/icons/`
 * - The game then receives either:
 *   - a real `/api/content/...` URL
 *   - or `null`, which means "use the safe placeholder tile"
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CyberCrushModulePage({
  searchParams
}: {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}) {
  const sp = (await searchParams) ?? {};

  const moduleIdRaw = Array.isArray(sp.moduleId) ? sp.moduleId[0] : sp.moduleId;
  const embedRaw = Array.isArray(sp.embed) ? sp.embed[0] : sp.embed;
  const userIdRaw = Array.isArray(sp.userId) ? sp.userId[0] : sp.userId;

  const moduleId = (moduleIdRaw ?? "cyber-crush-001").trim() || "cyber-crush-001";
  const embed = embedRaw === "1" || embedRaw === "true";

  const levels = await loadCyberCrushLevelsWithAssets();

  if (levels.length === 0 || levels.some((level) => level.tiles.length === 0)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Cyber Crush Error</h1>
          <p className="mt-2 text-sm text-muted-fg">
            Cyber Crush could not load its level configuration. Check{" "}
            <code>src/lib/cyberCrushLevelData.ts</code>.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <CyberCrushGame
      moduleId={moduleId}
      embed={embed}
      levels={levels}
      randomSeed={crypto.randomInt(1, 2_147_483_647)}
      userId={typeof userIdRaw === "string" ? userIdRaw : undefined}
    />
  );
}

