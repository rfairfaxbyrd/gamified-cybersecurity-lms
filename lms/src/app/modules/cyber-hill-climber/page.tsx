import { CyberHillClimberGame } from "@/components/CyberHillClimberGame";
import { Card } from "@/components/ui/card";
import { CYBER_HILL_QUESTIONS } from "@/lib/cyberHillQuestions";

/**
 * What this file does
 * - Exposes Cyber Hill Climber as a normal Next.js page route.
 * - This lets the module work:
 *   1) standalone in a browser
 *   2) embedded in the LMS module player iframe
 *
 * How to change it
 * - Change the question set in `src/lib/cyberHillQuestions.ts`
 * - Change the game UI in `src/components/CyberHillClimberGame.tsx`
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CyberHillClimberModulePage({
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

  const moduleId =
    (moduleIdRaw ?? "cyber-hill-climber-001").trim() || "cyber-hill-climber-001";
  const embed = embedRaw === "1" || embedRaw === "true";

  if (CYBER_HILL_QUESTIONS.length < 6 || CYBER_HILL_QUESTIONS.length > 7) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Cyber Hill Climber Error</h1>
          <p className="mt-2 text-sm text-muted-fg">
            This module expects 6 or 7 questions. Update{" "}
            <code>src/lib/cyberHillQuestions.ts</code>.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <CyberHillClimberGame
      moduleId={moduleId}
      embed={embed}
      userId={typeof userIdRaw === "string" ? userIdRaw : undefined}
      questions={CYBER_HILL_QUESTIONS}
    />
  );
}
