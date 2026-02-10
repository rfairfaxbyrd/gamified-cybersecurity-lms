import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * What this file does
 * - Provides small helpers to protect server-rendered pages.
 *
 * Key concepts (plain English)
 * - Pages like /modules and /dashboard should only work for signed-in users.
 * - Pages like /admin should only work for admins.
 *
 * How it works
 * - These functions run on the server.
 * - If the user is not allowed, we redirect to /login.
 *
 * How to change it
 * - If you later want public browsing, remove `requireUser()` from /modules.
 */

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session;
}

