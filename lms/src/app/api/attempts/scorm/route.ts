import { z } from "zod";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { syncUserBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";

/**
 * What this file does
 * - Provides a tiny JSON API that a SCORM package can "commit" to.
 *
 * Why this exists (plain English)
 * - SCORM content typically reports results by calling a JavaScript API:
 *   - SCORM 1.2: `window.API.LMSSetValue(...)`, `LMSCommit(...)`, `LMSFinish(...)`
 *   - SCORM 2004: `window.API_1484_11.SetValue(...)`, `Commit(...)`, `Terminate(...)`
 * - Our UI already supports manual score entry, but for SCORM we can capture those
 *   API calls and post the score/completion here automatically.
 *
 * How it works
 * 1) Verify the user is signed in (NextAuth session cookie).
 * 2) Validate payload (moduleId, score, completed, optional attemptId).
 * 3) Create a new Attempt (first commit) OR update the existing Attempt (later commits).
 * 4) If the attempt is completed, sync badges.
 *
 * How to change it
 * - If you later implement a full SCORM runtime (data model persistence, suspend data),
 *   you can expand this endpoint to store more fields from the SCORM "cmi.*" model.
 */

export const runtime = "nodejs";

const payloadSchema = z.object({
  moduleId: z.string().min(1, "Missing moduleId"),
  attemptId: z.string().min(1).optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  completed: z.boolean().optional()
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { moduleId, attemptId, score, completed } = parsed.data;

  const trainingModule = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!trainingModule) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const now = new Date();

  // "Upsert" behavior without exposing database internals:
  // - If `attemptId` is provided, we update that attempt (must belong to this user + module).
  // - Otherwise, we create a new attempt row.
  let attempt:
    | { id: string; completed: boolean; completedAt: Date | null }
    | null = null;

  if (attemptId) {
    const existing = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: session.user.id, moduleId }
    });
    if (!existing) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const nextCompleted = completed ?? existing.completed;
    const nextCompletedAt =
      existing.completedAt ?? (nextCompleted ? now : null);

    attempt = await prisma.attempt.update({
      where: { id: existing.id },
      data: {
        score: score === undefined ? existing.score : score,
        completed: nextCompleted,
        completedAt: nextCompletedAt
      },
      select: { id: true, completed: true, completedAt: true }
    });

    // If this update marks the attempt complete for the first time, re-check badges.
    if (!existing.completed && attempt.completed) {
      await syncUserBadges(session.user.id);
    }
  } else {
    const nextCompleted = completed ?? false;
    attempt = await prisma.attempt.create({
      data: {
        userId: session.user.id,
        moduleId,
        score: score ?? null,
        completed: nextCompleted,
        startedAt: now,
        completedAt: nextCompleted ? now : null
      },
      select: { id: true, completed: true, completedAt: true }
    });

    if (attempt.completed) {
      await syncUserBadges(session.user.id);
    }
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    completed: attempt.completed,
    completedAt: attempt.completedAt?.toISOString() ?? null
  });
}
