/**
 * What this file does
 * - Seeds the MVP database with:
 *   - 1 admin account
 *   - 1 demo user account
 *   - a small module catalog (linked to /content assets)
 *   - the MVP badge list
 *
 * Key concepts
 * - Seeding gives you a working demo immediately after `prisma migrate`.
 * - Passwords are stored as hashes (never plain text).
 *
 * How it works
 * - Prisma runs this file when you execute: `npm run db:seed`
 * - The script uses "upsert" so re-running it is safe.
 *
 * How to change it
 * - Add modules or adjust titles/descriptions.
 * - Change default seed emails/passwords via `.env`.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DIFFICULTIES, LAUNCH_TYPES, MODULE_TOPICS, ROLES } from "../src/lib/constants";

const prisma = new PrismaClient();

function env(name: string, fallback: string) {
  return process.env[name] && process.env[name]!.trim().length > 0
    ? process.env[name]!
    : fallback;
}

async function main() {
  const adminEmail = env("SEED_ADMIN_EMAIL", "admin@setonhill.edu");
  const adminPassword = env("SEED_ADMIN_PASSWORD", "Admin123!");
  const demoEmail = env("SEED_DEMO_EMAIL", "demo@setonhill.edu");
  const demoPassword = env("SEED_DEMO_PASSWORD", "Demo123!");

  const [adminHash, demoHash] = await Promise.all([
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(demoPassword, 12)
  ]);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Admin",
      role: ROLES[1],
      passwordHash: adminHash
    },
    create: {
      email: adminEmail,
      name: "Admin",
      role: ROLES[1],
      passwordHash: adminHash
    }
  });

  await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: "Demo User",
      role: ROLES[0],
      passwordHash: demoHash
    },
    create: {
      email: demoEmail,
      name: "Demo User",
      role: ROLES[0],
      passwordHash: demoHash
    }
  });

  const modules = [
    {
      id: "spot-the-phish",
      title: "Spot the Phish",
      topic: MODULE_TOPICS[2],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 10,
      description:
        "Identify common phishing signals in emails, links, and urgent requests.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "spot-the-phish.h5p"
    },
    {
      id: "sort-passwords",
      title: "Sort These Passwords by Strength",
      topic: MODULE_TOPICS[0],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 8,
      description:
        "Practice recognizing weak vs strong password patterns and passphrases.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "sort-these-passwords-by-strength.h5p"
    },
    {
      id: "password-threat-level-quiz",
      title: "Threat Level Test: Password Edition",
      topic: MODULE_TOPICS[0],
      difficulty: DIFFICULTIES[1],
      estimatedMinutes: 8,
      description:
        "Quick quiz to test password safety instincts (re-use, length, uniqueness).",
      launchType: LAUNCH_TYPES[0],
      launchPath: "quiz-threat-level-test-password-edition.h5p"
    },
    {
      id: "mfa-crack-the-code",
      title: "Crack the Code: MFA Edition",
      topic: MODULE_TOPICS[1],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 10,
      description:
        "Learn why multi-factor authentication matters and which factors are strongest.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "crack-the-code-mfa-edition.h5p"
    },
    {
      id: "mfa-this-or-that",
      title: "This or That: MFA Edition",
      topic: MODULE_TOPICS[1],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 6,
      description:
        "Choose the safer MFA options in common real-world scenarios.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "this-or-that-mfa-edition.h5p"
    },
    {
      id: "patch-or-pause",
      title: "Patch or Pause?",
      topic: MODULE_TOPICS[4],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 7,
      description:
        "Understand updates, patches, and why delaying them increases risk.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "patch-or-pause.h5p"
    },
    {
      id: "deepfake-or-real",
      title: "Deepfake or Real Deal?",
      topic: MODULE_TOPICS[3],
      difficulty: DIFFICULTIES[1],
      estimatedMinutes: 10,
      description:
        "Learn how to spot deepfakes and verify media before sharing.",
      launchType: LAUNCH_TYPES[0],
      launchPath: "deepfake-or-real-deal.h5p"
    },
    {
      id: "cybersecurity-matching-game",
      title: "Cybersecurity Matching Game",
      topic: MODULE_TOPICS[5],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 5,
      description:
        "Quick matching game to reinforce core cybersecurity concepts (phishing, MFA, malware, and more).",
      launchType: LAUNCH_TYPES[0],
      launchPath: "cybersecurity-memory.h5p"
    },
    {
      id: "cyber-word-search",
      title: "Cybersecurity Word Search",
      topic: MODULE_TOPICS[5],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 5,
      description:
        "Quick word search to reinforce key cybersecurity vocabulary (phishing, MFA, malware, and more).",
      // "APP" means the content is hosted as a Next.js page route inside this LMS.
      // The module player embeds it in an iframe.
      launchType: LAUNCH_TYPES[4],
      launchPath: "modules/word-search?moduleId=cyber-word-search&embed=1"
    },
    {
      id: "cyber-wordle-001",
      title: "Cybersecurity Wordle",
      topic: MODULE_TOPICS[5],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 3,
      description:
        "Wordle-style mini-game: guess the 5-letter cybersecurity word in 6 tries.",
      // "APP" means the content is hosted as a Next.js page route inside this LMS.
      // The module player embeds it in an iframe.
      launchType: LAUNCH_TYPES[4],
      launchPath: "modules/cyber-wordle?moduleId=cyber-wordle-001&embed=1"
    },
    {
      id: "cyber-crush-001",
      title: "Cyber Crush",
      topic: MODULE_TOPICS[5],
      difficulty: DIFFICULTIES[1],
      estimatedMinutes: 5,
      description:
        "Match-3 cybersecurity mini-game with a malware level and a security tools level.",
      launchType: LAUNCH_TYPES[4],
      launchPath: "modules/cyber-crush?moduleId=cyber-crush-001&embed=1"
    },
    {
      id: "cyber-hill-climber-001",
      title: "Cyber Hill Climber",
      topic: MODULE_TOPICS[5],
      difficulty: DIFFICULTIES[0],
      estimatedMinutes: 4,
      description:
        "Decision-based mountain climb game where each safer cybersecurity choice moves you closer to the summit.",
      launchType: LAUNCH_TYPES[4],
      launchPath: "modules/cyber-hill-climber?moduleId=cyber-hill-climber-001&embed=1"
    }
  ];

  for (const module of modules) {
    await prisma.module.upsert({
      where: { id: module.id },
      update: module,
      create: module
    });
  }

  const badges = [
    {
      id: "password-pro",
      name: "Password Pro",
      description: "Completed at least 1 Passwords module.",
      criteria: "Complete any module with topic = PASSWORDS."
    },
    {
      id: "phish-spotter",
      name: "Phish Spotter",
      description: "Completed a phishing module with a solid score.",
      criteria: "Complete Spot the Phish with score >= 80."
    },
    {
      id: "mfa-master",
      name: "MFA Master",
      description: "Completed at least 1 MFA module.",
      criteria: "Complete any module with topic = MFA."
    },
    {
      id: "deepfake-detective",
      name: "Deepfake Detective",
      description: "Completed the Deepfakes module.",
      criteria: "Complete Deepfake or Real Deal? (any passing score)."
    },
    {
      id: "streak-starter",
      name: "Streak Starter",
      description: "Completed 3 different modules.",
      criteria: "Complete 3 unique modules (any topics)."
    }
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { id: badge.id },
      update: badge,
      create: badge
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
