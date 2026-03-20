import Link from "next/link";
import { notFound } from "next/navigation";
import { submitAttempt } from "@/actions/attempts";
import { H5PStandalonePlayer } from "@/components/h5p-standalone-player";
import { ModuleCompletionListener } from "@/components/module-completion-listener";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureH5PExtracted } from "@/lib/content";
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
 * - MVP uses a manual "Submit score + Mark complete" UI for ALL module types.
 * - H5P packages are ZIPs; we extract them once and embed with `h5p-standalone`.
 *
 * How it works
 * - Server fetches module metadata from SQLite (Prisma).
 * - For H5P, server ensures the package is extracted under `/content/_extracted/<id>`.
 * - Client embeds content:
 *   - H5P: `H5PStandalonePlayer`
 *   - HTML: iframe to `/api/content/<launchPath>`
 *   - SCORM: iframe to `/api/content/<launchPath>` (treated like HTML for MVP)
 *
 * How to change it
 * - To implement SCORM score auto-capture later, add a SCORM runtime bridge and
 *   wire it into `submitAttempt`.
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

  // For most module types, `launchPath` points to a file under the repo-root `/content` folder
  // (served via `/api/content/...`).
  // For launchType="APP", `launchPath` is a *Next.js route* inside this app.
  const contentLaunchUrl = `/api/content/${trainingModule.launchPath}`;
  const launchUrl =
    trainingModule.launchType === "APP"
      ? trainingModule.launchPath.startsWith("/")
        ? trainingModule.launchPath
        : `/${trainingModule.launchPath}`
      : contentLaunchUrl;

  /**
   * Iframe sandboxing (plain English)
   * - The sandbox attribute is a browser safety feature: it can prevent embedded content
   *   from doing risky things (popups, top-level navigation, etc.).
   * - Some SCORM/HTML exports (especially from authoring tools) rely on a few of those
   *   capabilities to work correctly.
   *
   * MVP approach
   * - For built-in LMS modules ("APP"), we keep the sandbox tighter.
   * - For user-provided content ("HTML"/"SCORM"), we allow a few extra permissions for
   *   compatibility.
   */
  const iframeSandbox =
    trainingModule.launchType === "APP"
      ? "allow-scripts allow-same-origin allow-forms"
      : [
          "allow-scripts",
          "allow-same-origin",
          "allow-forms",
          // Common needs for SCORM/HTML exports:
          "allow-popups",
          "allow-popups-to-escape-sandbox",
          "allow-modals",
          "allow-downloads",
          "allow-top-navigation-by-user-activation"
        ].join(" ");

  return (
    <main className="mx-auto w-full max-w-[76rem] px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
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
              Launch: {humanizeEnum(trainingModule.launchType)}
            </span>
            {bestCompletedScore >= 0 ? (
              <span className="rounded-full border border-border bg-card px-2 py-1">
                Best score: {bestCompletedScore}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="mt-5 p-4 lg:p-5">
        <h2 className="font-semibold">Module</h2>
        <p className="mt-2 text-sm text-muted-fg">{trainingModule.description}</p>

        <div className="mt-4">
          {trainingModule.launchType === "HTML" ||
          trainingModule.launchType === "SCORM" ||
          trainingModule.launchType === "APP" ? (
            <div className="mx-auto min-h-[85vh] max-w-[48rem] space-y-2">
              <p className="text-sm text-muted-fg">
                This module is embedded in an iframe.
              </p>
              {/**
               * Shared sizing fix (plain English)
               * - The player window should feel tall enough that most gameplay is visible
               *   immediately, without the user needing to scroll just to see the main action.
               * - We keep the tighter width framing from the earlier sizing pass, but give
               *   the shared module viewport much more vertical height.
               * - This helps custom modules, SCORM-style exports, and HTML content feel better framed
               *   without changing their internal logic.
               */}
              <iframe
                title={trainingModule.title}
                src={launchUrl}
                className="h-[78vh] min-h-[560px] w-full rounded-xl border border-border bg-card md:h-[82vh] md:min-h-[620px] lg:h-[86vh] lg:min-h-[700px] xl:h-[88vh] xl:min-h-[760px] xl:max-h-[960px]"
                sandbox={iframeSandbox}
              />
            </div>
          ) : null}

          {trainingModule.launchType === "H5P" ? (
            <div className="mx-auto min-h-[85vh] max-w-[48rem] space-y-3">
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
                  <a href={contentLaunchUrl}>Download .h5p</a>
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
        </div>
      </Card>

      <Card className="mt-5 p-4 lg:p-5">
        <h2 className="font-semibold">Submit your result</h2>
        <p className="mt-2 text-sm text-muted-fg">
          After you finish the activity, enter your score (0–100) and mark the module
          complete. This records an attempt and updates points/badges.
        </p>

        {trainingModule.launchType === "APP" ? (
          <div className="mt-4">
            <ModuleCompletionListener moduleId={trainingModule.id} />
          </div>
        ) : null}

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

      <Card className="mt-5 p-4 lg:p-5">
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
