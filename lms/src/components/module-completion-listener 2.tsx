"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * What this file does
 * - Listens for embedded module completion events sent via `window.postMessage`.
 *
 * Why this exists (plain English)
 * - Some modules are embedded in an iframe (HTML apps, internal mini-games, etc.).
 * - When the embedded content finishes, it can notify the parent LMS by sending:
 *     { type: "MODULE_COMPLETE", moduleId, score, timeSeconds, hintsUsed, foundWords, totalWords }
 * - The LMS can then automatically store the Attempt in SQLite.
 *
 * How it works
 * 1) Listen to `window` "message" events.
 * 2) Validate the payload shape (lightweight sanity checks).
 * 3) If the `moduleId` matches the page's module, POST to `/api/attempts`.
 * 4) Show a small status panel so users understand what happened.
 *
 * Security note
 * - We only accept messages from the same origin as the LMS page.
 * - We also require the moduleId to match the currently-open module.
 *
 * How to change it
 * - If you embed cross-origin content later, you can relax the origin check,
 *   but you should implement a stronger handshake (shared token, allowlist, etc.).
 */

type ModuleCompleteMessage = {
  type: "MODULE_COMPLETE";
  moduleId: string;
  score: number;
  timeSeconds: number;
  hintsUsed: number;
  foundWords: number;
  totalWords: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseModuleCompleteMessage(value: unknown): ModuleCompleteMessage | null {
  if (!isPlainObject(value)) return null;
  if (value.type !== "MODULE_COMPLETE") return null;

  const moduleId = typeof value.moduleId === "string" ? value.moduleId : "";
  const score = typeof value.score === "number" ? value.score : NaN;
  const timeSeconds = typeof value.timeSeconds === "number" ? value.timeSeconds : NaN;
  const hintsUsed = typeof value.hintsUsed === "number" ? value.hintsUsed : NaN;
  const foundWords = typeof value.foundWords === "number" ? value.foundWords : NaN;
  const totalWords = typeof value.totalWords === "number" ? value.totalWords : NaN;

  if (!moduleId) return null;
  if (!Number.isFinite(score)) return null;

  return {
    type: "MODULE_COMPLETE",
    moduleId,
    score,
    timeSeconds: Number.isFinite(timeSeconds) ? timeSeconds : 0,
    hintsUsed: Number.isFinite(hintsUsed) ? hintsUsed : 0,
    foundWords: Number.isFinite(foundWords) ? foundWords : 0,
    totalWords: Number.isFinite(totalWords) ? totalWords : 0
  };
}

export function ModuleCompletionListener({ moduleId }: { moduleId: string }) {
  const [message, setMessage] = useState<ModuleCompleteMessage | null>(null);
  const [status, setStatus] = useState<
    "idle" | "received" | "saving" | "saved" | "error" | "ignored"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const savedRef = useRef(false);

  async function saveAttempt(payload: ModuleCompleteMessage) {
    if (savedRef.current) return;
    savedRef.current = true;

    setStatus("saving");
    setError(null);

    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          moduleId: payload.moduleId,
          score: payload.score,
          completed: true,
          timeSeconds: payload.timeSeconds,
          hintsUsed: payload.hintsUsed,
          foundWords: payload.foundWords,
          totalWords: payload.totalWords
        })
      });

      if (!res.ok) {
        savedRef.current = false; // allow retry button
        setStatus("error");
        setError(`Save failed (HTTP ${res.status}).`);
        return;
      }

      setStatus("saved");
    } catch (e) {
      savedRef.current = false;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Network error.");
    }
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only accept messages from this LMS origin.
      if (event.origin !== window.location.origin) return;

      const parsed = parseModuleCompleteMessage(event.data);
      if (!parsed) return;

      // Ignore completions from other iframes/modules.
      if (parsed.moduleId !== moduleId) {
        setStatus("ignored");
        return;
      }

      setMessage(parsed);
      setStatus("received");
      void saveAttempt(parsed);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [moduleId]);

  if (status === "idle") {
    return (
      <Card className="border border-border bg-muted p-3 text-sm text-muted-fg">
        This module can auto-save completion when the embedded content reports a result.
      </Card>
    );
  }

  if (status === "ignored") {
    return (
      <Card className="border border-border bg-muted p-3 text-sm text-muted-fg">
        Received a completion message for a different module (ignored).
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-muted p-3 text-sm">
      {message ? (
        <div className="space-y-1">
          <p className="font-medium text-fg">Embedded module reported completion</p>
          <p className="text-muted-fg">
            Score: <span className="font-medium text-fg">{message.score}%</span> · Time:{" "}
            <span className="font-medium text-fg">{message.timeSeconds}s</span> · Hints:{" "}
            <span className="font-medium text-fg">{message.hintsUsed}</span>
          </p>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status === "saving" ? (
          <span className="text-muted-fg">Saving…</span>
        ) : status === "saved" ? (
          <span className="font-medium text-fg">Saved to your dashboard.</span>
        ) : status === "error" ? (
          <span className="text-muted-fg">Could not save automatically.</span>
        ) : (
          <span className="text-muted-fg">Received.</span>
        )}

        {status === "saved" ? (
          <Button asChild variant="secondary" className="ml-auto">
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        ) : null}

        {status === "error" && message ? (
          <Button type="button" variant="secondary" className="ml-auto" onClick={() => saveAttempt(message)}>
            Retry save
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-muted-fg">{error}</p> : null}
    </Card>
  );
}

