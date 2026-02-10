"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncUserBadges } from "@/lib/badges";

/**
 * What this file does
 * - Implements the MVP "Submit score + mark complete" flow.
 *
 * Key concepts (plain English)
 * - SCORM/xAPI integrations are large projects.
 * - For the MVP, we capture training results with a simple form:
 *   - score (0–100)
 *   - completed (checkbox)
 * - We store submissions as `Attempt` rows.
 * - When a module is completed, we re-check badge eligibility.
 *
 * How it works
 * 1) User submits the form on the module player page.
 * 2) This server action validates the input.
 * 3) We create an Attempt row tied to the signed-in user.
 * 4) If completed, we sync earned badges.
 * 5) We revalidate pages so UI updates immediately.
 *
 * How to change it
 * - If you later implement automatic scoring (H5P events, SCORM API), replace the
 *   manual score input and call this action with those values.
 */

const attemptSchema = z.object({
  moduleId: z.string().min(1, "Missing moduleId"),
  score: z
    .preprocess((v) => {
      if (v == null) return null;
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (trimmed.length === 0) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }, z.number().int().min(0).max(100).nullable()),
  completed: z
    .preprocess((v) => v === "on" || v === "true", z.boolean())
    .default(false)
});

export async function submitAttempt(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const parsed = attemptSchema.safeParse({
    moduleId: formData.get("moduleId"),
    score: formData.get("score"),
    completed: formData.get("completed")
  });

  if (!parsed.success) {
    // For MVP we redirect back with a query param rather than building complex error UIs.
    redirect(`/dashboard?error=invalid_attempt`);
  }

  const { moduleId, score, completed } = parsed.data;

  // Guard against invalid module IDs (prevents foreign key errors + makes errors clearer).
  const trainingModule = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!trainingModule) redirect(`/modules?error=module_not_found`);

  const now = new Date();
  await prisma.attempt.create({
    data: {
      userId: session.user.id,
      moduleId,
      score,
      completed,
      startedAt: now,
      completedAt: completed ? now : null
    }
  });

  if (completed) {
    await syncUserBadges(session.user.id);
  }

  // Ensure pages that show progress update without a full refresh.
  revalidatePath("/dashboard");
  revalidatePath("/modules");
  revalidatePath(`/modules/${moduleId}`);

  redirect("/dashboard?updated=1");
}
