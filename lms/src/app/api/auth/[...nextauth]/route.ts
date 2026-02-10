import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * What this file does
 * - Exposes NextAuth's API route handlers for the App Router.
 *
 * Key concepts
 * - NextAuth expects a catch-all route at:
 *     /api/auth/[...nextauth]
 *
 * How it works
 * - NextAuth returns a handler function we export for GET/POST.
 *
 * How to change it
 * - Most auth changes happen in `src/lib/auth.ts`, not here.
 */

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

