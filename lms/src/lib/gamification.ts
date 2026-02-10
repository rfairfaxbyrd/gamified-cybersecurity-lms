import type { Attempt, Module } from "@prisma/client";

/**
 * What this file does
 * - Centralizes the MVP gamification rules:
 *   - how points are calculated
 *   - which badges a user has "earned" based on completions/scores
 *
 * Key concepts (plain English)
 * - We award points per *unique module completed* (not per attempt) to prevent
 *   point farming by repeating the same module.
 * - Badges are simple rule checks based on a user's completed attempts.
 *
 * How it works
 * - We look at the user's completed attempts.
 * - We take the *best completed score per module*.
 * - Points = base points + bonus (based on score).
 * - Badges = simple booleans (completed certain topics/modules, streak count).
 *
 * How to change it
 * - Update the constants/functions below and keep badge IDs in sync with seed data
 *   (`prisma/seed.ts`).
 */

export const POINTS_BASE_PER_MODULE = 100;

export function bonusPointsForScore(score: number | null | undefined) {
  if (score == null) return 0;
  if (score >= 90) return 50;
  if (score >= 80) return 25;
  if (score >= 70) return 10;
  return 0;
}

export function pointsForModuleCompletion(score: number | null | undefined) {
  return POINTS_BASE_PER_MODULE + bonusPointsForScore(score);
}

export type CompletedAttemptWithModule = Attempt & {
  module: Pick<Module, "id" | "topic" | "title">;
};

/**
 * Returns the best (highest score) completed attempt per module ID.
 */
export function bestCompletedAttemptsByModule(
  completedAttempts: CompletedAttemptWithModule[]
) {
  const best = new Map<string, CompletedAttemptWithModule>();

  for (const attempt of completedAttempts) {
    const existing = best.get(attempt.moduleId);
    const score = attempt.score ?? 0;
    const existingScore = existing?.score ?? 0;
    if (!existing || score > existingScore) best.set(attempt.moduleId, attempt);
  }

  return best;
}

/**
 * Calculates total points for a user.
 * - Uses ONLY best completed attempt per module.
 */
export function calculateTotalPoints(completedAttempts: CompletedAttemptWithModule[]) {
  const best = bestCompletedAttemptsByModule(completedAttempts);
  let total = 0;

  for (const attempt of best.values()) {
    total += pointsForModuleCompletion(attempt.score);
  }

  return total;
}

/**
 * Determines which badge IDs a user *should* have based on completed attempts.
 * Note: this is a pure function — it does not write to the database.
 */
export function determineEarnedBadgeIds(
  completedAttempts: CompletedAttemptWithModule[]
) {
  const earned = new Set<string>();
  const bestByModule = bestCompletedAttemptsByModule(completedAttempts);

  const completedTopics = new Set<string>();
  for (const attempt of bestByModule.values()) completedTopics.add(attempt.module.topic);

  // Badge: Password Pro
  if (completedTopics.has("PASSWORDS")) earned.add("password-pro");

  // Badge: MFA Master
  if (completedTopics.has("MFA")) earned.add("mfa-master");

  // Badge: Deepfake Detective
  if (bestByModule.has("deepfake-or-real")) earned.add("deepfake-detective");

  // Badge: Phish Spotter (score gate)
  const phishAttempt = bestByModule.get("spot-the-phish");
  if ((phishAttempt?.score ?? 0) >= 80) earned.add("phish-spotter");

  // Badge: Streak Starter
  if (bestByModule.size >= 3) earned.add("streak-starter");

  return earned;
}
