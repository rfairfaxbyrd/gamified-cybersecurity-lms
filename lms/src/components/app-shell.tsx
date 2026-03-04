import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * What this file does
 * - Provides shared page chrome (top navigation + content container).
 *
 * Key concepts
 * - Once authentication is wired up, this shell will:
 *   - show "Sign in" vs "Sign out"
 *   - show an Admin link only for admins
 *
 * How it works
 * - This is a Server Component by default (no "use client").
 *
 * How to change it
 * - Update links, add a footer, or change the layout spacing here.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const isAuthed = Boolean(session?.user?.id);
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="min-h-screen">
      <header data-app-shell-header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Cybersecurity LMS
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-fg">
            <Link href="/modules" className="hover:text-fg">
              Modules
            </Link>
            {isAuthed ? (
              <Link href="/dashboard" className="hover:text-fg">
                Dashboard
              </Link>
            ) : null}
            {isAdmin ? (
              <Link href="/admin" className="hover:text-fg">
                Admin
              </Link>
            ) : null}

            {isAuthed ? (
              <SignOutButton />
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-border px-3 py-1 hover:bg-muted"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Optional global message area (useful for MVP "preview build" notices). */}
      <div data-app-shell-preview className="mx-auto w-full max-w-5xl px-4 pt-4">
        <Card className="border border-border bg-muted p-3 text-xs text-muted-fg">
          Preview note: This project is under active MVP development.
        </Card>
      </div>

      {children}
    </div>
  );
}
