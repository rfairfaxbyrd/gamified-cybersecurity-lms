import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * What this file does
 * - Defines the app-wide "Not Found" (404) page for the App Router.
 *
 * Why this exists (plain English)
 * - Next.js will show this UI when a user visits a URL that does not match any page,
 *   like `/modules/does-not-exist`.
 * - Having an explicit `not-found.tsx` also makes production builds more reliable
 *   in some environments because the 404 route is generated from your own code.
 *
 * How to change it
 * - Update the message and links below.
 */

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-fg">
          The page you were looking for does not exist.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/modules">Browse modules</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}

