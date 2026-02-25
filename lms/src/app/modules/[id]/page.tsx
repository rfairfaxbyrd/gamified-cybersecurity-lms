import Link from "next/link";
import { notFound } from "next/navigation";
import { submitAttempt } from "@/actions/attempts";
import { H5PStandalonePlayer } from "@/components/h5p-standalone-player";
import { ScormIframePlayer } from "@/components/scorm-iframe-player";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureH5PExtracted, looksLikeScormLaunchPath } from "@/lib/content";
import { prisma } from "@/lib/db";
import { humanizeEnum } from "@/lib/format";
import { requireUser } from "@/lib/guards";

/**
 * What this file does
 * - Module "player" page:
 *   - launches/embeds the module content (H5P/HTML/SCORM placeholder)
 *   - captures a score + completion via a simple form
 *   - shows the user's recent attempts for this module
 *
 * Key concepts (plain English)
 * - Full SCORM/xAPI tracking is a large integration.
 * - MVP uses a manual "Submit score + Mark complete" UI.
 * - H5P packages are ZIPs; we extract them once and embed with `h5p-standalone`.
 *
 * How it works
 * - Server fetches module metadata from SQLite (Prisma).
 * - For H5P, server ensures the package is extracted under `/content/_extracted/<id>`.
 * - Client embeds content:
 *   - H5P: `H5PStandalonePlayer`
 *   - HTML: iframe to `/api/content/<launchPath>`
 *
 * How to change it
 * - To implement SCORM later, replace the placeholder with a real SCORM runtime.
 * - To auto-capture scores, wire module events into `submitAttempt`.
 */

export default async function ModulePlayerPage({
  params
}: {
  // In newer Next.js versions, `params` can be passed as a Promise.
  // `await` works for both a Promise and a plain object, so we write this defensively.
  params: Promise<{ id?: string }> | { id?: string };
}) {
  const session = await requireUser();
  const resolvedParams = await params;
  const moduleId = resolvedParams?.id;
  if (!moduleId) notFound();

  const trainingModule = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!trainingModule) notFound();

  const attempts = await prisma.attempt.findMany({
    where: { userId: session.user.id, moduleId: trainingModule.id },
    orderBy: { startedAt: "desc" },
    take: 10
  });

  const bestCompletedScore =
    attempts
      .filter((a) => a.completed)
      .reduce((max, a) => Math.max(max, a.score ?? 0), -1) ?? -1;

  // Prepare H5P extraction on the server so the client can embed immediately.
  let h5pJsonPath: string | null = null;
  let h5pError: string | null = null;
  if (trainingModule.launchType === "H5P") {
    try {
      const extracted = await ensureH5PExtracted({
        moduleId: trainingModule.id,
        h5pLaunchPath: trainingModule.launchPath
      });
      h5pJsonPath = `/api/content${extracted.extractedUrlPath}`;
    } catch (e) {
      // Log the real error so you can fix content issues quickly during development.
      // (We keep the on-screen message friendly, but include details in dev mode.)
      // eslint-disable-next-line no-console
      console.error("[H5P] Extraction failed", {
        moduleId: trainingModule.id,
        launchPath: trainingModule.launchPath,
        error: e
      });

      const msg = e instanceof Error ? e.message : String(e);
      h5pError =
        process.env.NODE_ENV === "development"
          ? `H5P extraction failed: ${msg}`
          : "This H5P package could not be prepared for embedding. You can still download it below.";
    }
  }

  const launchUrl = `/api/content/${trainingModule.launchPath}`;
  const scormAutoSync =
    trainingModule.launchType === "SCORM" ||
    (trainingModule.launchType === "HTML" &&
      (await looksLikeScormLaunchPath(trainingModule.launchPath)));

  const displayLaunchType = scormAutoSync ? "SCORM" : trainingModule.launchType;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link href="/modules" className="text-sm text-muted-fg hover:text-fg">
            ← Back to catalog
          </Link>
          <h1 className="text-2xl font-semibold">{trainingModule.title}</h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-fg">
            <span className="rounded-full border border-border bg-card px-2 py-1">
              {humanizeEnum(trainingModule.topic)}
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-1">
              {humanizeEnum(trainingModule.difficulty)}
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-1">
              {trainingModule.estimatedMinutes} min
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-1">
              Launch: {humanizeEnum(displayLaunchType)}
            </span>
            {bestCompletedScore >= 0 ? (
              <span className="rounded-full border border-border bg-card px-2 py-1">
                Best score: {bestCompletedScore}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Module</h2>
        <p className="mt-2 text-sm text-muted-fg">{trainingModule.description}</p>

        <div className="mt-4">
          {trainingModule.launchType === "HTML" && !scormAutoSync ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-fg">
                This module is an exported HTML experience embedded in an iframe.
              </p>
              <iframe
                title={trainingModule.title}
                src={launchUrl}
                className="h-[70vh] w-full rounded-lg border border-border bg-card"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          ) : null}

          {trainingModule.launchType === "H5P" ? (
            <div className="space-y-3">
              {h5pError ? (
                <div className="rounded-lg border border-border bg-muted p-3 text-sm text-fg">
                  {h5pError}
                </div>
              ) : null}

              {h5pJsonPath ? (
                <H5PStandalonePlayer h5pJsonPath={h5pJsonPath} />
              ) : (
                <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-fg">
                  H5P embed not available yet.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" asChild>
                  <a href={launchUrl}>Download .h5p</a>
                </Button>
                <p className="text-xs text-muted-fg">
                  Tip: If embedding fails, re-run <code>npm install</code> (copies
                  vendor assets) and ensure the server can write to{" "}
                  <code>/content/_extracted</code>.
                </p>
              </div>
            </div>
          ) : null}

          {trainingModule.launchType === "SCORM_PLACEHOLDER" ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-fg">
              SCORM playback is not implemented in the MVP. Use the completion form
              below to capture results.
            </div>
          ) : null}

          {scormAutoSync ? (
            <ScormIframePlayer
              moduleId={trainingModule.id}
              title={trainingModule.title}
              src={launchUrl}
              learner={{
                id: session.user.id,
                name: session.user.name ?? null,
                email: session.user.email ?? null
              }}
            />
          ) : null}
        </div>
      </Card>

      {scormAutoSync ? (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Score sync</h2>
          <p className="mt-2 text-sm text-muted-fg">
            This looks like a SCORM package, so the LMS will try to capture the score and
            completion automatically. You do not need to type your score manually.
          </p>
          <details className="mt-4 rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Manual override (only if needed)
            </summary>
            <p className="mt-2 text-sm text-muted-fg">
              If your SCORM content does not report results (or you want to test the
              gamification flow), you can submit a manual attempt here.
            </p>

            <form action={submitAttempt} className="mt-4 space-y-4">
              <input type="hidden" name="moduleId" value={trainingModule.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="score">Score (0–100)</Label>
                  <Input
                    id="score"
                    name="score"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    placeholder="e.g., 85"
                  />
                  <p className="text-xs text-muted-fg">
                    Leave blank if the module does not provide a score.
                  </p>
                </div>

                <div className="flex items-end gap-2">
                  <input
                    id="completed"
                    name="completed"
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="completed">Mark complete</Label>
                </div>
              </div>

              <Button type="submit">Save result</Button>
            </form>
          </details>
        </Card>
      ) : (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Submit your result</h2>
          <p className="mt-2 text-sm text-muted-fg">
            After you finish the activity, enter your score (0–100) and mark the module
            complete. This records an attempt and updates points/badges.
          </p>

          <form action={submitAttempt} className="mt-4 space-y-4">
            <input type="hidden" name="moduleId" value={trainingModule.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="score">Score (0–100)</Label>
                <Input
                  id="score"
                  name="score"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  placeholder="e.g., 85"
                />
                <p className="text-xs text-muted-fg">
                  Leave blank if the module does not provide a score.
                </p>
              </div>

              <div className="flex items-end gap-2">
                <input
                  id="completed"
                  name="completed"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="completed">Mark complete</Label>
              </div>
            </div>

            <Button type="submit">Save result</Button>
          </form>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Your recent attempts</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-fg">
            No attempts yet. When you submit a result, it will appear here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-fg">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Completed</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      {a.startedAt.toLocaleString()}
                    </td>
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
