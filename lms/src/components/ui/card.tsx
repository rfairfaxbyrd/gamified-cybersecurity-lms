import { cn } from "@/lib/cn";

/**
 * What this file does
 * - A simple card container used throughout the UI.
 *
 * How to change it
 * - Update border/background/radius here to affect all cards.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-card", className)}
      {...props}
    />
  );
}

