import type { DefaultSession } from "next-auth";

/**
 * What this file does
 * - Extends NextAuth's TypeScript types to include our custom fields:
 *   - `session.user.id`
 *   - `session.user.role`
 *
 * Key concepts
 * - NextAuth lets you "augment" its types via `declare module`.
 * - This is compile-time only (it does not change runtime behavior).
 *
 * How it works
 * - Our `authOptions.callbacks.session` attaches these fields at runtime.
 *
 * How to change it
 * - If you add more user fields to the session (e.g. department), define them here too.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role: "USER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "USER" | "ADMIN";
  }
}

