import { requireAdmin } from "@/lib/guards";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  bestCompletedAttemptsByModule,
  calculateTotalPoints
} from "@/lib/gamification";
import { humanizeEnum } from "@/lib/format";

/**
 * What this file does
 * - Admin dashboard (MVP analytics):
 *   - per-user completion + average scores
 *   - per-module completion counts + average scores
 *   - CSV export endpoint link
 *
 * Key concepts (plain English)
 * - Admins can monitor training completion without digging into the database.
 * - A simple CSV export helps integrate with reporting workflows.
 *
 * How it works
 * - Server-rendered page that queries SQLite via Prisma.
 *
 * How to change it
 * - Add more metrics (time spent, last login) as you expand the schema.
 */
export default async function AdminPage() {
  await requireAdmin();

  const [users, modules, completedAttempts, badgeCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    }),
    prisma.module.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, topic: true, difficulty: true }
    }),
    prisma.attempt.findMany({
      where: { completed: true },
      include: { module: { select: { id: true, topic: true, title: true } } }
    }),
    prisma.userBadge.groupBy({
      by: ["userId"],
      _count: { _all: true }
    })
  ]);

  const badgeCountByUserId = new Map<string, number>(
    badgeCounts.map((b) => [b.userId, b._count._all])
  );

  // Group completed attempts by user.
  const completedByUser = new Map<string, typeof completedAttempts>();
  for (const a of completedAttempts) {
    const list = completedByUser.get(a.userId) ?? [];
    list.push(a);
    completedByUser.set(a.userId, list);
  }

  const userRows = users.map((u) => {
    const attemptsForUser = completedByUser.get(u.id) ?? [];
    const bestByModule = bestCompletedAttemptsByModule(attemptsForUser);
    const completedUniqueModules = bestByModule.size;

    const scores = [...bestByModule.values()].map((a) => a.score ?? 0);
    const avgBestScore =
      scores.length === 0
        ? 0
        : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);

    const points = calculateTotalPoints(attemptsForUser);
    const badges = badgeCountByUserId.get(u.id) ?? 0;

    return {
      ...u,
      completedUniqueModules,
      avgBestScore,
      points,
      badges
    };
  });

  // Module analytics: completions + avg best score per user (per module).
  const bestScoreByModuleByUser = new Map<string, Map<string, number>>();
  for (const a of completedAttempts) {
    const moduleId = a.moduleId;
    const userId = a.userId;
    const score = a.score ?? 0;

    const byUser = bestScoreByModuleByUser.get(moduleId) ?? new Map<string, number>();
    const existing = byUser.get(userId);
    if (existing == null || score > existing) byUser.set(userId, score);
    bestScoreByModuleByUser.set(moduleId, byUser);
  }

  const moduleRows = modules.map((m) => {
    const byUser = bestScoreByModuleByUser.get(m.id) ?? new Map<string, number>();
    const scores = [...byUser.values()];
    const completions = scores.length;
    const avgBestScore =
      scores.length === 0
        ? 0
        : Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    return { ...m, completions, avgBestScore };
  });

  const totalUsers = users.length;
  const totalModules = modules.length;
  const totalCompletions = moduleRows.reduce((sum, r) => sum + r.completions, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <p className="mt-2 text-muted-fg">
        Completion analytics and exports for cybersecurity awareness training.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Users</p>
          <p className="mt-1 text-2xl font-semibold">{totalUsers}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Modules</p>
          <p className="mt-1 text-2xl font-semibold">{totalModules}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Total completions</p>
          <p className="mt-1 text-2xl font-semibold">{totalCompletions}</p>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href="/api/admin/attempts.csv">Download attempts CSV</a>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/modules">Go to catalog</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Users</h2>
          <p className="mt-2 text-sm text-muted-fg">
            Completed modules, average best score, points, and badge count.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-fg">
                <tr>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Completed</th>
                  <th className="py-2 pr-4">Avg score</th>
                  <th className="py-2 pr-4">Points</th>
                  <th className="py-2 pr-4">Badges</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-fg">{u.email}</p>
                    </td>
                    <td className="py-2 pr-4">{humanizeEnum(u.role)}</td>
                    <td className="py-2 pr-4">
                      {u.completedUniqueModules}/{totalModules}
                    </td>
                    <td className="py-2 pr-4">{u.avgBestScore}</td>
                    <td className="py-2 pr-4">{u.points}</td>
                    <td className="py-2 pr-4">{u.badges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Modules</h2>
          <p className="mt-2 text-sm text-muted-fg">
            Completion count and average best score across users.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-fg">
                <tr>
                  <th className="py-2 pr-4">Module</th>
                  <th className="py-2 pr-4">Topic</th>
                  <th className="py-2 pr-4">Difficulty</th>
                  <th className="py-2 pr-4">Completions</th>
                  <th className="py-2 pr-4">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {moduleRows.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <Link href={`/modules/${m.id}`} className="hover:underline">
                        {m.title}
                      </Link>
                      <p className="text-xs text-muted-fg">{m.id}</p>
                    </td>
                    <td className="py-2 pr-4 text-muted-fg">
                      {humanizeEnum(m.topic)}
                    </td>
                    <td className="py-2 pr-4 text-muted-fg">
                      {humanizeEnum(m.difficulty)}
                    </td>
                    <td className="py-2 pr-4">{m.completions}</td>
                    <td className="py-2 pr-4">{m.avgBestScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
