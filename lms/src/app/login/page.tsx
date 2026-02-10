import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * What this file does
 * - Renders the login page for local (credentials) accounts.
 *
 * Key concepts
 * - For the MVP we use NextAuth Credentials provider (username/password).
 * - Roles are stored in the database (user vs admin).
 *
 * How it works
 * - The actual sign-in call lives in `LoginForm` so we can show client-side
 *   validation and friendly error messages.
 *
 * How to change it
 * - When you later add SSO (SAML/OIDC), this page can become a provider picker.
 */
export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/modules");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Use your university LMS account (MVP uses local demo accounts).
        </p>
        <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-xs text-muted-fg">
          <p className="font-medium text-fg">Seeded demo accounts (dev only)</p>
          <p className="mt-1">
            Admin: <code>admin@setonhill.edu</code> / <code>Admin123!</code>
          </p>
          <p>
            User: <code>demo@setonhill.edu</code> / <code>Demo123!</code>
          </p>
        </div>
        <div className="mt-6">
          <LoginForm />
        </div>
      </Card>
    </main>
  );
}
