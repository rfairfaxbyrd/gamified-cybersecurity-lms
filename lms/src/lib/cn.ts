import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * What this file does
 * - Exports a single helper `cn()` to build Tailwind className strings.
 *
 * Key concepts
 * - `clsx` handles conditional classes (truthy/falsey).
 * - `tailwind-merge` removes conflicting Tailwind utilities (e.g., `p-2` vs `p-4`).
 *
 * How it works
 * - Call `cn("p-2", isActive && "bg-accent")`.
 *
 * How to change it
 * - Usually you don't. Keep this as a shared utility.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

