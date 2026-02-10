"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What this file does
 * - Embeds an extracted H5P module using the `h5p-standalone` runtime.
 *
 * Key concepts (plain English)
 * - A `.h5p` file is a ZIP package. It must be extracted to a folder that contains:
 *   - `h5p.json`
 *   - `content/`
 *   - `libraries/`
 * - `h5p-standalone` loads these files over HTTP and renders the activity in the browser.
 *
 * How it works
 * - Server prepares/extracts content under `/content/_extracted/<moduleId>/...`.
 * - We serve it via `/api/content/_extracted/<moduleId>`.
 * - This component points `h5pJsonPath` at that URL.
 *
 * How to change it
 * - If you move vendor assets, update `frameJs` and `frameCss` below.
 */

export function H5PStandalonePlayer({
  h5pJsonPath
}: {
  /**
   * URL path where `h5p.json` lives (the folder, not the file).
   * Example: `/api/content/_extracted/spot-the-phish`
   */
  h5pJsonPath: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountSeqRef = useRef(0);

  useEffect(() => {
    // React Strict Mode (dev) intentionally runs effects twice to catch bugs.
    // Many third-party libraries are not "effect-idempotent" and can render twice.
    // We use a sequence counter to ensure only the latest mount "wins".
    mountSeqRef.current += 1;
    const mountSeq = mountSeqRef.current;

    let disposed = false;
    const el = containerRef.current;
    if (!el) return;
    const token = String(mountSeq);

    // Create an inner mount root so we can clean up ONLY what this mount created.
    // This avoids "double players" in dev when Strict Mode runs effects twice.
    el.innerHTML = "";
    const mountRoot = document.createElement("div");
    mountRoot.dataset.h5pMountToken = token;
    el.appendChild(mountRoot);

    async function mount() {
      try {
        setError(null);

        // These are copied into `/public/vendor/h5p-standalone/*` on `npm install`
        // via `scripts/postinstall.mjs`.
        // If you prefer a CDN, you can replace these with jsdelivr URLs.
        const frameJs = "/vendor/h5p-standalone/frame.bundle.js";
        const frameCss = "/vendor/h5p-standalone/styles/h5p.css";

        // Dynamically import so this file never evaluates browser-only code on the server.
        const { H5P } = await import("h5p-standalone");

        // Note: some versions of `h5p-standalone` return a Promise-like object from
        // `new H5P(...)`, while others return a plain instance.
        // We detect a thenable and await it to reduce race conditions.
        const instance = new H5P(mountRoot, {
          h5pJsonPath,
          frameJs,
          frameCss
        }) as unknown;

        const maybeThenable = instance as { then?: unknown };
        if (typeof maybeThenable.then === "function") {
          await (instance as PromiseLike<unknown>);
        }

        // If this mount is stale, wipe any DOM it added.
        if (disposed || mountSeqRef.current !== mountSeq) {
          return;
        }
      } catch (e) {
        if (!disposed && mountSeqRef.current === mountSeq) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(
            process.env.NODE_ENV === "development"
              ? `This H5P module could not be embedded. (${msg})`
              : "This H5P module could not be embedded."
          );
        }
      }
    }

    void mount();

    return () => {
      disposed = true;
      // Remove any DOM injected by H5P (prevents double-render artifacts in dev).
      mountRoot.remove();
    };
  }, [h5pJsonPath]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-border bg-muted p-3 text-sm text-fg">
          {error}
        </div>
      ) : null}
      <div ref={containerRef} />
    </div>
  );
}
