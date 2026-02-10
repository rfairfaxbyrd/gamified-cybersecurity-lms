import { cn } from "@/lib/cn";

/**
 * What this file does
 * - A styled text input for consistent forms.
 */
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus:ring-2 focus:ring-accent",
        className
      )}
      {...props}
    />
  );
}

