/**
 * What this file does
 * - Centralizes "enum-like" constants for the MVP.
 *
 * Why this exists (plain English)
 * - Prisma enums can be problematic with some SQLite connectors.
 * - We store these fields as strings in the database and validate them in code.
 *
 * How to change it
 * - If you add a new topic/difficulty/launch type, update:
 *   1) these arrays
 *   2) seed data (`prisma/seed.ts`)
 *   3) any UI filters
 */

export const ROLES = ["USER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MODULE_TOPICS = [
  "PASSWORDS",
  "MFA",
  "PHISHING",
  "DEEPFAKES",
  "PATCHING",
  // A catch-all topic for "general awareness" mini-games and mixed-topic content.
  "AWARENESS"
] as const;
export type ModuleTopic = (typeof MODULE_TOPICS)[number];

export const LAUNCH_TYPES = ["H5P", "HTML", "SCORM", "SCORM_PLACEHOLDER", "APP"] as const;
export type LaunchType = (typeof LAUNCH_TYPES)[number];
