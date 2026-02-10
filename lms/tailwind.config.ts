import type { Config } from "tailwindcss";

/**
 * What this file does
 * - Tells Tailwind where to scan for class names.
 * - Defines theme tokens (colors) backed by CSS variables.
 *
 * Key concepts
 * - We use CSS variables for "Seton Hill inspired" accents so swapping themes later
 *   is a one-file change (see `src/app/globals.css`).
 *
 * How it works
 * - Tailwind compiles only the classes it finds in the `content` globs.
 *
 * How to change it
 * - Update the CSS variables in `globals.css` to re-theme the entire UI.
 */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        fg: "hsl(var(--fg))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-fg": "hsl(var(--muted-fg))",
        accent: "hsl(var(--accent))",
        "accent-fg": "hsl(var(--accent-fg))",
        "accent-2": "hsl(var(--accent-2))"
      },
      borderRadius: {
        lg: "0.75rem"
      }
    }
  },
  plugins: []
} satisfies Config;

