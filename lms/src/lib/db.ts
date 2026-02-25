import { PrismaClient } from "@prisma/client";

/**
 * What this file does
 * - Creates (and re-uses) a single PrismaClient instance.
 *
 * Key concepts
 * - Next.js dev mode can hot-reload files, which can accidentally create many
 *   database connections if we instantiate Prisma repeatedly.
 *
 * How it works
 * - In development, we store PrismaClient on `globalThis` and re-use it.
 * - In production, we create a fresh client once per server process.
 *
 * How to change it
 * - If you later switch from SQLite to Postgres, this file usually stays the same.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Uncomment for query logging during debugging:
    // log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
