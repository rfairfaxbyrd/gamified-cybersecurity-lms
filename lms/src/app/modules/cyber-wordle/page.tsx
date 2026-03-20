import crypto from "node:crypto";
import { CyberWordleGame } from "@/components/CyberWordleGame";
import { Card } from "@/components/ui/card";
import { normalizeAlpha, pickFromSeed } from "@/lib/wordleEngine";

/**
 * What this file does
 * - Exposes the "Cybersecurity Wordle" as a normal Next.js page so it can run:
 *   1) Standalone (open directly in a browser)
 *   2) LMS-embedded (loaded in an iframe, reporting results via postMessage)
 *
 * Key concepts (plain English)
 * - This page is server-rendered, but the actual game is a client component.
 * - We select the solution word on the server so:
 *   - `seed` can deterministically force a specific puzzle
 *   - non-seeded launches can pick a random word each time
 *
 * URL parameters supported
 * - `moduleId` (string)   → required for LMS reporting; defaults to `cyber-wordle-001`
 * - `userId`  (string?)   → accepted for compatibility; not trusted for saving results
 * - `seed`    (string?)   → forces a specific word (deterministic)
 * - `embed=1` (string?)   → if present, the game auto-posts completion to the parent window
 *
 * How to change it
 * - Edit `WORDS` below to change the included solutions.
 */

export const runtime = "nodejs";

// We want a fresh random choice on each request (unless `seed` is present).
// This prevents the route from being accidentally cached as a static page.
export const dynamic = "force-dynamic";

// IMPORTANT: These must be exactly 5 letters each (Wordle requirement).
// Display: uppercase in UI; Internally: lowercase.
const WORDS = ["Cyber", "Phish", "Patch", "Virus", "Alert", "Spams"].map(normalizeAlpha);

export default async function CyberWordleModulePage({
  searchParams
}: {
  // In newer Next.js versions, `searchParams` can be a Promise.
  // `await` works for both a Promise and a plain object.
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}) {
  const sp = (await searchParams) ?? {};

  const moduleIdRaw = Array.isArray(sp.moduleId) ? sp.moduleId[0] : sp.moduleId;
  const seedRaw = Array.isArray(sp.seed) ? sp.seed[0] : sp.seed;
  const embedRaw = Array.isArray(sp.embed) ? sp.embed[0] : sp.embed;
  const userIdRaw = Array.isArray(sp.userId) ? sp.userId[0] : sp.userId;

  const moduleId = (moduleIdRaw ?? "cyber-wordle-001").trim() || "cyber-wordle-001";
  const embed = embedRaw === "1" || embedRaw === "true";

  // Safety guard: ensure our words actually meet the 5-letter requirement.
  const bad = WORDS.find((w) => w.length !== 5);
  if (bad) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Wordle Error</h1>
          <p className="mt-2 text-sm text-muted-fg">
            The word <code>{bad}</code> is not 5 letters. Fix the <code>WORDS</code>{" "}
            list in <code>src/app/modules/cyber-wordle/page.tsx</code>.
          </p>
        </Card>
      </main>
    );
  }

  // Choose solution:
  // - With seed: deterministic choice (useful for testing)
  // - Without seed: random choice each request
  const solution =
    typeof seedRaw === "string" && seedRaw.trim().length > 0
      ? pickFromSeed({ seed: seedRaw, items: WORDS })
      : WORDS[crypto.randomInt(0, WORDS.length)]!;

  return (
    <CyberWordleGame
      moduleId={moduleId}
      solution={solution}
      embed={embed}
      userId={typeof userIdRaw === "string" ? userIdRaw : undefined}
    />
  );
}

