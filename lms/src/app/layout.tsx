import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

/**
 * What this file does
 * - Defines the root HTML layout for every page.
 *
 * Key concepts
 * - The App Router (`src/app/*`) uses `layout.tsx` as the shared wrapper.
 * - We keep global UI (nav/footer) inside `AppShell`.
 *
 * How it works
 * - Next.js renders this layout on the server.
 * - Each page is injected where `{children}` appears.
 *
 * How to change it
 * - Edit `AppShell` to change navigation or overall page chrome.
 * - Edit `globals.css` to change theme tokens (colors).
 */

export const metadata: Metadata = {
  title: "Gamified Cybersecurity Awareness LMS",
  description:
    "A small MVP LMS for interactive cybersecurity awareness modules with points and badges."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

