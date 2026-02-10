"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * What this file does
 * - Embeds a SCORM package (HTML in an iframe) AND exposes a minimal SCORM API
 *   so the package can report:
 *   - score (0–100)
 *   - completion / pass status
 * - Automatically posts those results to our LMS (`/api/attempts/scorm`).
 *
 * Key concepts (plain English)
 * - SCORM packages do NOT magically write to your database.
 * - They expect the host LMS to provide a "runtime API" in JavaScript:
 *   - SCORM 1.2 uses `window.API` with methods like `LMSSetValue`, `LMSCommit`.
 *   - SCORM 2004 uses `window.API_1484_11` with `SetValue`, `Commit`.
 * - The content calls those methods, and the LMS is responsible for persisting them.
 *
 * MVP scope (important)
 * - This is NOT a full SCORM implementation (resume data, objectives, interactions, etc.).
 * - It is intentionally small: enough for many SCORM exports to report score + completion.
 *
 * How it works
 * 1) On mount, we attach `window.API` and `window.API_1484_11`.
 * 2) When the SCORM package calls SetValue/Commit/Finish/Terminate we:
 *    - update an in-memory "CMI map" of values
 *    - derive `score` and `completed` from that map
 *    - POST to `/api/attempts/scorm` to create/update an Attempt row.
 *
 * How to change it
 * - If your packages use different CMI keys, update `deriveScoreAndCompletion(...)`.
 * - If you want to store more SCORM fields, expand the API endpoint payload + schema.
 */

type ScormUiState = {
  score: number | null;
  completed: boolean;
  lastCommitAt: string | null;
  lastError: string | null;
};

type ScormCmiMap = Record<string, string>;

function normalizeMaybeNumber(input: string | undefined) {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function clampPercent(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function deriveScoreAndCompletion(cmi: ScormCmiMap) {
  // SCORM 1.2 keys (common)
  const lessonStatusRaw = (cmi["cmi.core.lesson_status"] ?? "").toLowerCase();
  const scoreRaw12 = normalizeMaybeNumber(cmi["cmi.core.score.raw"]);

  // SCORM 2004 keys (common)
  const completionStatus2004 = (cmi["cmi.completion_status"] ?? "").toLowerCase();
  const successStatus2004 = (cmi["cmi.success_status"] ?? "").toLowerCase();
  const scoreRaw2004 = normalizeMaybeNumber(cmi["cmi.score.raw"]);
  const scoreScaled2004 = normalizeMaybeNumber(cmi["cmi.score.scaled"]);

  // Some tools export "scaled" as 0..1 (SCORM 2004),
  // others report a raw percentage directly. We support both.
  const scoreScaledAsPercent =
    scoreScaled2004 == null
      ? null
      : scoreScaled2004 <= 1
        ? scoreScaled2004 * 100
        : scoreScaled2004;

  const score =
    scoreRaw12 ??
    scoreRaw2004 ??
    (scoreScaledAsPercent == null ? null : clampPercent(scoreScaledAsPercent));

  // What counts as "completed" for MVP:
  // - SCORM 1.2: completed OR passed
  // - SCORM 2004: completion_status=completed OR success_status=passed
  const completed =
    lessonStatusRaw === "completed" ||
    lessonStatusRaw === "passed" ||
    completionStatus2004 === "completed" ||
    successStatus2004 === "passed";

  return { score: score == null ? null : clampPercent(score), completed };
}

function truthyScorm(result: boolean) {
  // SCORM APIs typically return strings.
  return result ? "true" : "false";
}

export function ScormIframePlayer({
  moduleId,
  title,
  src,
  learner
}: {
  moduleId: string;
  title: string;
  src: string;
  /**
   * Optional learner info for SCORM GetValue calls.
   * Some packages display the learner name inside the content.
   */
  learner?: { id: string; name?: string | null; email?: string | null };
}) {
  const ownerToken = useMemo(
    () => `gclms_scorm_${moduleId}_${Math.random().toString(16).slice(2)}`,
    [moduleId]
  );

  const cmiRef = useRef<ScormCmiMap>({});
  const attemptIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [ui, setUi] = useState<ScormUiState>({
    score: null,
    completed: false,
    lastCommitAt: null,
    lastError: null
  });

  // Keep a "last derived" snapshot so we don't re-render on every SCORM SetValue call.
  const lastDerivedRef = useRef<{ score: number | null; completed: boolean } | null>(
    null
  );

  const updateDerivedUi = useCallback(() => {
    const derived = deriveScoreAndCompletion(cmiRef.current);
    const prev = lastDerivedRef.current;
    if (prev && prev.score === derived.score && prev.completed === derived.completed) return;
    lastDerivedRef.current = derived;
    setUi((u) => ({ ...u, score: derived.score, completed: derived.completed }));
  }, []);

  const flushAttempt = useCallback(
    async (opts?: { keepalive?: boolean }) => {
    const derived = deriveScoreAndCompletion(cmiRef.current);

    // Avoid creating noise in the database: only save when we have something meaningful.
    if (derived.score == null && !derived.completed) return;

    if (inFlightRef.current) {
      pendingFlushRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      const payload = {
        moduleId,
        attemptId: attemptIdRef.current ?? undefined,
        score: derived.score,
        completed: derived.completed
      };

      const res = await fetch("/api/attempts/scorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // keepalive helps when SCORM calls Finish/Terminate as the page is closing.
        keepalive: opts?.keepalive ?? false
      });

      if (!res.ok) {
        setUi((u) => ({
          ...u,
          lastError: `Save failed (${res.status})`
        }));
        return;
      }

      const data = (await res.json()) as { attemptId?: string };
      if (data.attemptId) attemptIdRef.current = data.attemptId;

      setUi((u) => ({
        ...u,
        lastCommitAt: new Date().toLocaleString(),
        lastError: null
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUi((u) => ({ ...u, lastError: `Save failed (${msg})` }));
    } finally {
      inFlightRef.current = false;
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
        void flushAttempt(opts);
      }
    }
    },
    [moduleId]
  );

  useEffect(() => {
    // Seed a few "nice to have" learner values that some SCORM packages read.
    // This does NOT grant access to anything; it just provides labels to content.
    if (learner?.id) {
      cmiRef.current["cmi.core.student_id"] = learner.id;
      cmiRef.current["cmi.learner_id"] = learner.id;
    }
    if (learner?.name) {
      cmiRef.current["cmi.core.student_name"] = learner.name;
      cmiRef.current["cmi.learner_name"] = learner.name;
    }
    if (learner?.email) {
      // Not a standard SCORM field, but harmless as a "custom" string.
      cmiRef.current["gclms.learner_email"] = learner.email;
    }

    updateDerivedUi();

    // Snapshot any existing globals so we can restore them on unmount.
    const w = window as unknown as {
      API?: unknown;
      API_1484_11?: unknown;
      __gclmsScormOwner?: string;
    };

    const prevApi12 = w.API;
    const prevApi2004 = w.API_1484_11;
    w.__gclmsScormOwner = ownerToken;

    // SCORM "last error" support (minimal).
    // Many packages check these but do not rely on detailed codes.
    let lastError = "0";

    function setValue(element: string, value: unknown) {
      cmiRef.current[String(element)] = value == null ? "" : String(value);
      updateDerivedUi();

      // If the content just marked itself complete, save right away.
      const derived = deriveScoreAndCompletion(cmiRef.current);
      if (derived.completed) {
        void flushAttempt();
      }

      lastError = "0";
      return truthyScorm(true);
    }

    function getValue(element: string) {
      const v = cmiRef.current[String(element)];
      lastError = "0";
      return v ?? "";
    }

    // SCORM 1.2 API (`window.API`)
    const api12 = {
      LMSInitialize: () => {
        lastError = "0";
        return truthyScorm(true);
      },
      LMSFinish: () => {
        lastError = "0";
        void flushAttempt({ keepalive: true });
        return truthyScorm(true);
      },
      LMSGetValue: (element: string) => getValue(element),
      LMSSetValue: (element: string, value: unknown) => setValue(element, value),
      LMSCommit: () => {
        lastError = "0";
        void flushAttempt();
        return truthyScorm(true);
      },
      LMSGetLastError: () => lastError,
      LMSGetErrorString: () => "No error",
      LMSGetDiagnostic: () => ""
    };

    // SCORM 2004 API (`window.API_1484_11`)
    const api2004 = {
      Initialize: () => {
        lastError = "0";
        return truthyScorm(true);
      },
      Terminate: () => {
        lastError = "0";
        void flushAttempt({ keepalive: true });
        return truthyScorm(true);
      },
      GetValue: (element: string) => getValue(element),
      SetValue: (element: string, value: unknown) => setValue(element, value),
      Commit: () => {
        lastError = "0";
        void flushAttempt();
        return truthyScorm(true);
      },
      GetLastError: () => lastError,
      GetErrorString: () => "No error",
      GetDiagnostic: () => ""
    };

    w.API = api12;
    w.API_1484_11 = api2004;

    function onPageHide() {
      void flushAttempt({ keepalive: true });
    }
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);

      // Only remove/restore APIs if this component still "owns" them.
      // This protects against React Strict Mode dev double-mount behavior.
      if (w.__gclmsScormOwner !== ownerToken) return;

      w.__gclmsScormOwner = undefined;
      w.API = prevApi12;
      w.API_1484_11 = prevApi2004;
    };
  }, [
    flushAttempt,
    learner?.email,
    learner?.id,
    learner?.name,
    moduleId,
    ownerToken,
    updateDerivedUi
  ]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-fg">
        This module is a SCORM package embedded in an iframe. If the package reports a
        score/completion via the SCORM API, the LMS will auto-save it for you.
      </p>

      <div className="flex flex-wrap gap-2 text-xs text-muted-fg">
        <span className="rounded-full border border-border bg-card px-2 py-1">
          Captured score: {ui.score == null ? "—" : `${ui.score}%`}
        </span>
        <span className="rounded-full border border-border bg-card px-2 py-1">
          Completed: {ui.completed ? "Yes" : "No"}
        </span>
        <span className="rounded-full border border-border bg-card px-2 py-1">
          Last saved: {ui.lastCommitAt ?? "—"}
        </span>
        {ui.lastError ? (
          <span className="rounded-full border border-border bg-muted px-2 py-1 text-fg">
            {ui.lastError}
          </span>
        ) : null}
      </div>

      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        className="h-[70vh] w-full rounded-lg border border-border bg-card"
        // SCORM packages are usually "just HTML/JS".
        // `allow-same-origin` is required so the iframe can access `window.parent.API`.
        sandbox="allow-scripts allow-same-origin allow-forms"
        onLoad={() => {
          // Extra robustness: also put the API onto the iframe window itself.
          // Many packages search up the window chain, but some check `window.API` first.
          try {
            const child = iframeRef.current?.contentWindow as
              | (Window & { API?: unknown; API_1484_11?: unknown })
              | null
              | undefined;
            if (!child) return;
            child.API = (window as unknown as { API?: unknown }).API;
            child.API_1484_11 = (window as unknown as { API_1484_11?: unknown })
              .API_1484_11;
          } catch {
            // If the browser blocks access for any reason, we silently ignore it.
          }
        }}
      />
    </div>
  );
}
