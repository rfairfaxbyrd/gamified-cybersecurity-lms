import { prisma } from "@/lib/db";
import { determineEarnedBadgeIds } from "@/lib/gamification";

/**
 * What this file does
 * - Synchronizes earned badges into the database (UserBadges table).
 *
 * Key concepts (plain English)
 * - `determineEarnedBadgeIds()` tells us which badges a user qualifies for.
 * - This file turns that "should have" list into persisted rows.
 *
 * How it works
 * 1) Load the user's completed attempts (with module info).
 * 2) Compute which badge IDs are earned.
 * 3) Insert missing (userId, badgeId) pairs.
 *
 * How to change it
 * - If you add new badge rules, update `determineEarnedBadgeIds()` and seed data.
 */

export async function syncUserBadges(userId: string) {
  const completedAttempts = await prisma.attempt.findMany({
    where: { userId, completed: true },
    include: {
      module: {
        select: { id: true, topic: true, title: true }
      }
    }
  });

  const earnedBadgeIds = determineEarnedBadgeIds(completedAttempts);
  if (earnedBadgeIds.size === 0) return { created: 0 };

  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true }
  });

  const existingIds = new Set(existing.map((b) => b.badgeId));
  const toCreate = [...earnedBadgeIds]
    .filter((id) => !existingIds.has(id))
    .map((badgeId) => ({ userId, badgeId }));

  if (toCreate.length === 0) return { created: 0 };

  const result = await prisma.userBadge.createMany({
    data: toCreate
  });

  return { created: result.count };
}
