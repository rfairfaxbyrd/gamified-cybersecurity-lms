import crypto from "node:crypto";
import { WordSearchGame } from "@/components/word-search-game";
import {
  generateWordSearchPuzzle,
  pickVariantFromSeed
} from "@/lib/wordSearchGenerator";
import { Card } from "@/components/ui/card";

/**
 * What this file does
 * - Exposes the "Cybersecurity Word Search" as a normal Next.js page so it can run:
 *   1) Standalone (open directly in a browser)
 *   2) LMS-embedded (loaded in an iframe, reporting results via postMessage)
 *
 * Key concepts (plain English)
 * - This page is server-rendered, but the actual game is a client component.
 * - We generate the puzzle on the server (fast + deterministic), then pass it to the client.
 *
 * URL parameters supported
 * - `moduleId` (string)   → required for LMS reporting; defaults to `cyber-word-search`
 * - `userId`  (string?)   → accepted for compatibility; not trusted for saving results
 * - `seed`    (string?)   → selects 1 of 5 puzzle variants (deterministic)
 * - `embed=1` (string?)   → if present, the game auto-posts completion to the parent window
 *
 * How to change it
 * - Edit the `WORDS` list to change the included words.
 * - Tune generator settings in `src/lib/wordSearchGenerator.ts`.
 */

export const runtime = "nodejs";

const WORDS = [
  "cyber",
  "security",
  "phishing",
  "passphrase",
  "patching",
  "data",
  "protection",
  "malware",
  "biometrics",
  "mfa"
];

function displayWord(word: string) {
  if (word.toLowerCase() === "mfa") return "MFA";
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
}

export default async function WordSearchModulePage({
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

  const moduleId = (moduleIdRaw ?? "cyber-word-search").trim() || "cyber-word-search";
  const embed = embedRaw === "1" || embedRaw === "true";

  const seededVariant = pickVariantFromSeed(seedRaw, 5);
  const variant = seededVariant ?? crypto.randomInt(0, 5);

  const puzzle = generateWordSearchPuzzle({
    words: WORDS.map(displayWord),
    variant,
    baseSize: 15
  });

  // Very small guard: if the generator ever returns a puzzle missing words (shouldn't happen),
  // show an error instead of an unusable game.
  if (puzzle.words.length !== WORDS.length) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Word Search Error</h1>
          <p className="mt-2 text-sm text-muted-fg">
            The puzzle generator did not produce the expected word list. Check{" "}
            <code>src/lib/wordSearchGenerator.ts</code>.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <WordSearchGame
      moduleId={moduleId}
      puzzle={puzzle}
      embed={embed}
      userId={typeof userIdRaw === "string" ? userIdRaw : undefined}
    />
  );
}

