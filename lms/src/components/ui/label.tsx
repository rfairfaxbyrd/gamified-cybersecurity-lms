import { cn } from "@/lib/cn";

/**
 * What this file does
 * - A small label component for form fields.
 */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-fg", className)}
      {...props}
    />
  );
}

