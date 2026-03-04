import { z } from "zod";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncUserBadges } from "@/lib/badges";

/**
 * What this file does
 * - Provides a small JSON API to save an Attempt (score + completion) from
 *   embedded mini-modules (like the Word Search).
 *
 * Why this exists (plain English)
 * - Our MVP originally saved results via a server action + form submission.
 * - Some standalone/embedded modules are easier to build as pure client code.
 * - Client code can POST JSON here to record a score/completion for the signed-in user.
 *
 * Security model (important)
 * - This endpoint NEVER trusts a `userId` passed from the browser.
 * - It uses the NextAuth session cookie to identify the user.
 * - If you are not signed in, it returns 401.
 *
 * How it works
 * 1) Require an authenticated session.
 * 2) Validate JSON body with Zod.
 * 3) Ensure the module exists (prevents foreign key errors).
 * 4) Create an Attempt row.
 * 5) If completed, sync badges.
 *
 * How to change it
 * - If you add more Attempt fields (time spent, hints, etc), extend the Zod schema
 *   and the `prisma.attempt.create` call below.
 */

export const runtime = "nodejs";

const payloadSchema = z.object({
  moduleId: z.string().min(1, "Missing moduleId"),
  score: z.number().int().min(0).max(100).optional(),
  completed: z.boolean().optional().default(true),

  // Optional analytics (safe to ignore if the DB schema doesn't store them yet).
  timeSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
  hintsUsed: z.number().int().min(0).max(500).optional(),
  foundWords: z.number().int().min(0).max(500).optional(),
  totalWords: z.number().int().min(0).max(500).optional()
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { moduleId, score, completed, timeSeconds } = parsed.data;

  const trainingModule = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!trainingModule) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const now = new Date();
  const startedAt =
    typeof timeSeconds === "number" ? new Date(now.getTime() - timeSeconds * 1000) : now;

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.user.id,
      moduleId,
      score: typeof score === "number" ? score : null,
      completed,
      startedAt,
      completedAt: completed ? now : null
    },
    select: { id: true }
  });

  if (completed) {
    await syncUserBadges(session.user.id);
  }

  return NextResponse.json({ ok: true, attemptId: attempt.id });
}

