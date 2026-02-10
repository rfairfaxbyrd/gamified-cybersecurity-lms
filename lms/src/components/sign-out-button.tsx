"use client";

import { signOut } from "next-auth/react";

/**
 * What this file does
 * - Provides a Sign Out button.
 *
 * Key concepts
 * - Signing out is a client-side action (`next-auth/react`).
 *
 * How it works
 * - Calls NextAuth `signOut()` which clears the session cookie.
 *
 * How to change it
 * - Update callbackUrl if you want a different post-logout landing page.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      className="rounded-md border border-border px-3 py-1 hover:bg-muted"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </button>
  );
}
