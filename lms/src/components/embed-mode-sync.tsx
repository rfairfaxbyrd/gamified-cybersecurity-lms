"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * What this file does
 * - Keeps the shared LMS chrome in sync with iframe/embed mode.
 *
 * Why this exists
 * - Native modules are loaded inside the LMS module player using URLs like:
 *   `/modules/cyber-hill-climber?embed=1`
 * - If the embedded page still renders the LMS header/preview note inside the iframe,
 *   a noticeable chunk of the available height is wasted.
 * - That makes the module feel "zoomed in" even at normal browser zoom.
 *
 * How it works
 * - Watches the current URL query string for `embed=1` or `embed=true`.
 * - Adds `gclms-embed` to `<body>` when embedded.
 * - Global CSS then hides the LMS chrome and tightens shared wrapper spacing.
 *
 * Safety
 * - This only changes presentation for pages that explicitly opt into embed mode.
 * - Standalone routes and the main LMS shell are unchanged.
 */
export function EmbedModeSync() {
  const searchParams = useSearchParams();
  const embedParam = searchParams?.get("embed");
  const isEmbedded = embedParam === "1" || embedParam === "true";

  useEffect(() => {
    document.body.classList.toggle("gclms-embed", isEmbedded);

    return () => {
      document.body.classList.remove("gclms-embed");
    };
  }, [isEmbedded]);

  return null;
}
