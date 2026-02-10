import Link from "next/link";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { humanizeEnum } from "@/lib/format";
import { requireUser } from "@/lib/guards";
import {
  bestCompletedAttemptsByModule,
  calculateTotalPoints
} from "@/lib/gamification";

/**
 * What this file does
 * - Shows the signed-in user's progress:
 *   - completed modules
 *   - points
 *   - earned badges
 *   - recent attempt history
 *
 * Key concepts
 * - We compute points from attempts (best score per module).
 * - Badges are stored in the database (UserBadges) after completions.
 *
 * How it works
 * - Server-rendered page that queries SQLite via Prisma.
 *
 * How to change it
 * - If you later decide to "award points once" at completion time, you can store
 *   points per attempt and simplify this page.
 */
export default async function DashboardPage({
  searchParams
}: {
  searchParams?: { updated?: string; error?: string };
}) {
  const session = await requireUser();
  const userId = session.user.id;

  const [modules, completedAttempts, attempts, userBadges] = await Promise.all([
    prisma.module.findMany({ orderBy: { title: "asc" } }),
    prisma.attempt.findMany({
      where: { userId, completed: true },
      include: { module: { select: { id: true, topic: true, title: true } } }
    }),
    prisma.attempt.findMany({
      where: { userId },
      include: { module: { select: { title: true } } },
      orderBy: { startedAt: "desc" },
      take: 20
    }),
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: "desc" }
    })
  ]);

  const bestByModule = bestCompletedAttemptsByModule(completedAttempts);
  const completedCount = bestByModule.size;
  const totalModules = modules.length;
  const totalPoints = calculateTotalPoints(completedAttempts);

  const percent =
    totalModules === 0 ? 0 : Math.round((completedCount / totalModules) * 100);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your Dashboard</h1>
          <p className="mt-2 text-muted-fg">
            Track completion, points, badges, and your attempt history.
          </p>
        </div>
        <p className="text-sm text-muted-fg">
          Signed in as{" "}
          <span className="font-medium text-fg">{session.user.email}</span>
        </p>
      </div>

      {searchParams?.updated ? (
        <Card className="mt-6 border border-border bg-muted p-4 text-sm text-fg">
          Saved! Your progress has been updated.
        </Card>
      ) : null}

      {searchParams?.error ? (
        <Card className="mt-6 border border-border bg-muted p-4 text-sm text-fg">
          Something went wrong. Please try again.
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Completion</p>
          <p className="mt-1 text-2xl font-semibold">
            {completedCount}/{totalModules}
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-fg">{percent}% complete</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-muted-fg">Points</p>
          <p className="mt-1 text-2xl font-semibold">{totalPoints}</p>
          <p className="mt-2 text-xs text-muted-fg">
            Earn 100 points per completed module + bonuses for high scores.
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-muted-fg">Badges</p>
          <p className="mt-1 text-2xl font-semibold">{userBadges.length}</p>
          <p className="mt-2 text-xs text-muted-fg">
            Badges unlock automatically when you complete modules.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Badges</h2>
          {userBadges.length === 0 ? (
            <p className="mt-2 text-sm text-muted-fg">
              No badges yet. Complete a module to earn your first badge.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {userBadges.map((ub) => (
                <li key={ub.id} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-sm font-medium">{ub.badge.name}</p>
                  <p className="mt-1 text-xs text-muted-fg">
                    {ub.badge.description}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-fg">
                    Earned: {ub.earnedAt.toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Module progress</h2>
          <p className="mt-2 text-sm text-muted-fg">
            Best completed score per module (points are calculated from this).
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-fg">
                <tr>
                  <th className="py-2 pr-4">Module</th>
                  <th className="py-2 pr-4">Topic</th>
                  <th className="py-2 pr-4">Best score</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const best = bestByModule.get(m.id);
                  const bestScore = best?.score ?? null;
                  const completed = Boolean(best);

                  return (
                    <tr key={m.id} className="border-t border-border">
                      <td className="py-2 pr-4">
                        <Link href={`/modules/${m.id}`} className="hover:underline">
                          {m.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted-fg">
                        {humanizeEnum(m.topic)}
                      </td>
                      <td className="py-2 pr-4">{bestScore ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {completed ? "Completed" : "Not completed"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Recent attempts</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-fg">
            No attempts yet. Start by launching a module from the catalog.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-fg">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Module</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Completed</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2 pr-4">{a.startedAt.toLocaleString()}</td>
                    <td className="py-2 pr-4">{a.module.title}</td>
                    <td className="py-2 pr-4">{a.score ?? "—"}</td>
                    <td className="py-2 pr-4">{a.completed ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
