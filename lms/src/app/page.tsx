import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * What this file does
 * - Public landing page (simple and neutral).
 *
 * Key concepts
 * - MVP goal is to get users into training quickly.
 *
 * How it works
 * - This page is intentionally static and does not require authentication.
 *
 * How to change it
 * - Adjust the copy or add a screenshot of the dashboard once the MVP is stable.
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="grid gap-6 md:grid-cols-2 md:items-center">
        <div className="space-y-4">
          <p className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-fg">
            MVP • Next.js • SQLite • Gamification
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Gamified Cybersecurity Awareness Training
          </h1>
          <p className="text-muted-fg">
            Short, interactive modules (passwords, MFA, phishing, deepfakes) with
            points, badges, and a progress dashboard.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/modules">Browse modules</Link>
            </Button>
          </div>
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">What you can do</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-fg">
            <li>Launch a module (embed or placeholder)</li>
            <li>Submit a score and mark completion</li>
            <li>Earn points and badges</li>
            <li>Track progress in a personal dashboard</li>
            <li>Admins can view completion analytics + export CSV</li>
          </ul>
          <p className="mt-4 text-xs text-muted-fg">
            Note: This is an MVP designed to be small but complete end-to-end.
          </p>
        </Card>
      </div>
    </main>
  );
}

