"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * What this file does
 * - Implements the MVP login form using NextAuth Credentials.
 *
 * Key concepts
 * - NextAuth handles sessions/cookies for us.
 * - We keep the UI "dumb": it just sends email + password to NextAuth.
 *
 * How it works
 * - `signIn("credentials", ...)` posts to NextAuth's auth endpoint.
 * - On success we redirect to `/modules`.
 *
 * How to change it
 * - Add form fields (e.g., "remember me") or change the callback URL.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !submitting;
  }, [email, password, submitting]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: "/modules"
      });

      if (!result) {
        setError("Unexpected error: no response from sign-in.");
        return;
      }

      if (result.error) {
        setError("Invalid email or password.");
        return;
      }

      // NextAuth gives us a URL to redirect to (or we can hardcode /modules).
      window.location.href = result.url ?? "/modules";
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="demo@setonhill.edu"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-fg">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
