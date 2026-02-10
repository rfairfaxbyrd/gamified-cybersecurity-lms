import React from "react";
import { cn } from "@/lib/cn";

/**
 * What this file does
 * - Provides a small, reusable button component with consistent styling.
 *
 * Key concepts
 * - `asChild` lets us render a link that looks like a button.
 *
 * How it works
 * - This is intentionally lightweight (no external UI library for MVP).
 *
 * How to change it
 * - Update the class strings to adjust sizing/variants globally.
 */
export function Button({
  className,
  variant = "primary",
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  asChild?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-accent text-accent-fg hover:opacity-95",
    secondary: "border border-border bg-card hover:bg-muted",
    ghost: "hover:bg-muted"
  };

  const classes = cn(base, variants[variant], className);

  if (asChild) {
    // "asChild" means: apply button styling to the child element (often a <Link>).
    // This keeps our API small without pulling in a UI library.
    if (!React.isValidElement(children)) {
      throw new Error("Button with `asChild` expects a single React element child.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child = children as any;
    return React.cloneElement(child, {
      className: cn(classes, child.props?.className)
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
