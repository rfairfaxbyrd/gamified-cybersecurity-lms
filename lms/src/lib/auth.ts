import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/constants";

/**
 * What this file does
 * - Defines the NextAuth configuration for the MVP (Credentials provider).
 * - Attaches `role` to the session so we can enforce admin-only pages.
 *
 * Key concepts (plain English)
 * - NextAuth handles cookies and session security for us.
 * - "Credentials provider" means we manage our own user database.
 * - We store roles in the DB and copy them into the user's session.
 *
 * How it works (step-by-step)
 * 1) The login form calls `signIn("credentials", { email, password })`.
 * 2) NextAuth calls `authorize()` below.
 * 3) We look up the user in SQLite via Prisma.
 * 4) We compare the provided password to the stored password hash (bcrypt).
 * 5) If valid, we return a minimal user object.
 * 6) NextAuth creates a JWT-backed session and stores it in cookies.
 *
 * How to change it
 * - To add SSO later (OIDC/SAML), add providers here and update the login page.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function normalizeRole(value: unknown): Role {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

export const authOptions: NextAuthOptions = {
  // MVP note: JWT sessions keep the DB schema small (no Session table required).
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // This is the user object NextAuth will encode into the JWT.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: normalizeRole(user.role)
        } as const;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Runs whenever a JWT is created/updated.
      // On initial sign-in, `user` is defined.
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = normalizeRole((user as any).role);
      }
      return token;
    },
    async session({ session, token }) {
      // Runs whenever `getServerSession()` is called.
      if (session.user) {
        session.user.id = token.sub ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session.user.role = normalizeRole((token as any).role ?? "USER");
      }
      return session;
    }
  }
};
