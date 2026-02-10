import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { humanizeEnum } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DIFFICULTIES, MODULE_TOPICS } from "@/lib/constants";

/**
 * What this file does
 * - Displays the module catalog as cards with simple filters.
 *
 * Key concepts
 * - Filters are done via URL query params (so links are shareable).
 * - We also show per-user progress (best score + completion status).
 *
 * How it works
 * - Server-rendered page:
 *   - loads modules from SQLite (Prisma)
 *   - loads the signed-in user's completed attempts
 *
 * How to change it
 * - Add more filters by extending the `filterSchema`.
 */
const filterSchema = z.object({
  topic: z.enum(MODULE_TOPICS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional()
});

export default async function ModulesPage({
  searchParams
}: {
  searchParams?: { topic?: string; difficulty?: string };
}) {
  const session = await requireUser();
  const parsed = filterSchema.safeParse({
    topic: searchParams?.topic,
    difficulty: searchParams?.difficulty
  });

  const topic = parsed.success ? parsed.data.topic : undefined;
  const difficulty = parsed.success ? parsed.data.difficulty : undefined;

  const modules = await prisma.module.findMany({
    where: {
      ...(topic ? { topic } : {}),
      ...(difficulty ? { difficulty } : {})
    },
    orderBy: { title: "asc" }
  });

  const completedAttempts = await prisma.attempt.findMany({
    where: { userId: session.user.id, completed: true },
    select: { moduleId: true, score: true }
  });

  // Best (highest) score per module.
  const bestScoreByModule = new Map<string, number>();
  for (const attempt of completedAttempts) {
    const score = attempt.score ?? 0;
    const existing = bestScoreByModule.get(attempt.moduleId);
    if (existing == null || score > existing) bestScoreByModule.set(attempt.moduleId, score);
  }

  const topics = MODULE_TOPICS;
  const difficulties = DIFFICULTIES;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Module Catalog</h1>
          <p className="mt-2 text-muted-fg">
            Browse short, interactive training modules. Filter by topic or difficulty.
          </p>
        </div>
        <p className="text-sm text-muted-fg">
          Signed in as{" "}
          <span className="font-medium text-fg">{session.user.email}</span>
        </p>
      </div>

      <Card className="mt-6 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium">Topic</label>
            <select
              name="topic"
              defaultValue={topic ?? ""}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {humanizeEnum(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Difficulty</label>
            <select
              name="difficulty"
              defaultValue={difficulty ?? ""}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">All levels</option>
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {humanizeEnum(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="w-full sm:w-auto">
              Apply
            </Button>
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href="/modules">Reset</Link>
            </Button>
          </div>
        </form>
      </Card>

      {modules.length === 0 ? (
        <p className="mt-6 text-sm text-muted-fg">
          No modules match your current filters.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const bestScore = bestScoreByModule.get(module.id);
          const isCompleted = bestScore != null;

          return (
            <Card key={module.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{module.title}</h2>
                <span
                  className={
                    isCompleted
                      ? "rounded-full border border-border bg-muted px-2 py-1 text-xs text-fg"
                      : "rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-fg"
                  }
                >
                  {isCompleted ? "Completed" : "Not completed"}
                </span>
              </div>

              <p className="mt-2 text-sm text-muted-fg">{module.description}</p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-fg">
                <span className="rounded-full border border-border bg-card px-2 py-1">
                  {humanizeEnum(module.topic)}
                </span>
                <span className="rounded-full border border-border bg-card px-2 py-1">
                  {humanizeEnum(module.difficulty)}
                </span>
                <span className="rounded-full border border-border bg-card px-2 py-1">
                  {module.estimatedMinutes} min
                </span>
                {isCompleted ? (
                  <span className="rounded-full border border-border bg-card px-2 py-1">
                    Best score: {bestScore}%
                  </span>
                ) : null}
              </div>

              <div className="mt-4">
                <Button asChild className="w-full">
                  <Link href={`/modules/${module.id}`}>Launch</Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
