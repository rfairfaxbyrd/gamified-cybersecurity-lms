"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  WORDLE_MAX_GUESSES,
  WORDLE_WORD_LENGTH,
  applyEvaluationToKeyboard,
  computeScore,
  evaluateGuess,
  isValidGuess,
  normalizeAlpha,
  type EvaluatedTile,
  type LetterState
} from "@/lib/wordleEngine";

/**
 * What this file does
 * - Implements the interactive "Cybersecurity Wordle" mini-game UI:
 *   - 5x6 grid (5 letters, 6 attempts)
 *   - on-screen keyboard + physical keyboard support
 *   - Wordle-style tile feedback (correct/present/absent)
 *   - timer + simple scoring
 *   - completion reporting to the LMS (postMessage + optional API save)
 *
 * Key concepts (plain English)
 * - This component is a *client component* because it needs browser input events.
 * - The actual Wordle scoring logic lives in `src/lib/wordleEngine.ts` so it's easy to
 *   reason about and hard to break.
 *
 * How we validate a guess
 * - A guess must be exactly 5 letters (a–z). We do not require a dictionary for MVP.
 *
 * How Wordle checking works (including repeated letters)
 * - See `src/lib/wordleEngine.ts` for the careful "greens first, then yellows" algorithm.
 *
 * How LMS reporting works
 * - When the game ends (win OR loss), we compute a final score and send:
 *   window.parent.postMessage({ type: "MODULE_COMPLETE", moduleId, score, attemptsUsed, success, solutionWord, timeSeconds }, "*")
 * - If `embed=true`, we auto-post the completion message once.
 * - We also show a fallback "Save Result" button that POSTs to `/api/attempts`.
 *
 * How to change the word list
 * - The word list is chosen in the page route that renders this component:
 *   `src/app/modules/cyber-wordle/page.tsx`
 *
 * How this sizing pass works
 * - The outer module container stays large so the LMS player still feels roomy.
 * - Inside that roomy shell, we shrink support cards, chips, and helper text so the
 *   board and keyboard remain the main focus.
 * - Readability is preserved by tightening padding and spacing instead of making
 *   controls tiny.
 */

type CompletionPayload = {
  type: "MODULE_COMPLETE";
  moduleId: string;
  score: number;
  attemptsUsed: number;
  success: boolean;
  solutionWord: string;
  timeSeconds: number;
};

type Row = {
  guess: string; // normalized lowercase
  evaluation: EvaluatedTile[];
};

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function tileClass(state: LetterState | null) {
  // We intentionally map "Wordle colors" to our LMS theme tokens:
  // - correct  -> accent (maroon)
  // - present  -> accent-2 (gold)
  // - absent   -> muted-fg (gray)
  // This keeps the look neutral + Seton Hill–inspired instead of "NYT green".
  if (state === "correct") return "bg-accent text-accent-fg border-accent";
  if (state === "present") return "bg-accent-2 text-fg border-accent-2";
  if (state === "absent") return "bg-muted text-fg border-muted";
  return "bg-bg text-fg border-border";
}

function keyClass(state: LetterState | undefined) {
  if (state === "correct") return "bg-accent text-accent-fg";
  if (state === "present") return "bg-accent-2 text-fg";
  if (state === "absent") return "bg-muted text-fg";
  return "bg-card text-fg";
}

export function CyberWordleGame(props: {
  moduleId: string;
  solution: string; // normalized-ish; we will normalize again just in case
  embed: boolean;
  userId?: string;
}) {
  const moduleId = props.moduleId;
  const embed = props.embed;

  // Normalized solution (lowercase a–z only). We keep this in memory; it's not "secure",
  // but that's fine for a training mini-game.
  const solution = useMemo(() => normalizeAlpha(props.solution), [props.solution]);

  // ----- Timer state (starts on first guess) -----
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!startedAtMs) return;
    if (endedAtMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs, endedAtMs]);

  const timeSeconds =
    startedAtMs == null
      ? 0
      : Math.max(0, Math.floor(((endedAtMs ?? Date.now()) - startedAtMs) / 1000));

  function startTimerIfNeeded() {
    if (!startedAtMs) setStartedAtMs(Date.now());
  }

  // ----- Gameplay state -----
  const [rows, setRows] = useState<Row[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [keyboard, setKeyboard] = useState<Record<string, LetterState | undefined>>({});

  const [status, setStatus] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Which row index is currently revealing with a "flip" animation.
  const [revealRowIndex, setRevealRowIndex] = useState<number | null>(null);

  const attemptsUsed = rows.length;
  const lastRow = rows.at(-1) ?? null;
  const success = Boolean(lastRow && lastRow.guess === solution);
  const failed = !success && attemptsUsed >= WORDLE_MAX_GUESSES;
  const completed = success || failed;

  const score = useMemo(() => {
    if (!completed) return 0;
    return computeScore({ success, attemptsUsed });
  }, [attemptsUsed, completed, success]);

  // ----- Completion reporting / saving -----
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error" | "unauthorized"
  >("idle");
  const postedRef = useRef(false);

  // When the game ends, freeze the timer once and post completion to the parent LMS (embed mode).
  useEffect(() => {
    if (!completed) return;
    if (!endedAtMs) setEndedAtMs(Date.now());

    if (!embed) return;
    if (postedRef.current) return;
    postedRef.current = true;

    const payload: CompletionPayload = {
      type: "MODULE_COMPLETE",
      moduleId,
      score,
      attemptsUsed,
      success,
      solutionWord: solution,
      timeSeconds
    };

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        setStatus("Game over. Result sent to the LMS.");
      }
    } catch {
      setStatus("Game over. (Could not message the parent LMS. You can still save the result.)");
    }
  }, [attemptsUsed, completed, embed, endedAtMs, moduleId, score, solution, success, timeSeconds]);

  function resetBoardSameSolution() {
    setRows([]);
    setCurrentGuess("");
    setKeyboard({});
    setStatus(null);
    setShake(false);
    setRevealRowIndex(null);
    setSaveState("idle");
    postedRef.current = false;
    setStartedAtMs(null);
    setEndedAtMs(null);
  }

  function newGameReload() {
    // The page route chooses the random solution (unless `seed` is provided).
    // Reloading is the simplest, most reliable way to start a fresh puzzle.
    window.location.reload();
  }

  function triggerShake(message: string) {
    setStatus(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 350);
  }

  function addLetter(letter: string) {
    if (completed) return;
    startTimerIfNeeded();

    if (currentGuess.length >= WORDLE_WORD_LENGTH) return;
    setCurrentGuess((g) => (g + letter).slice(0, WORDLE_WORD_LENGTH));
  }

  function backspace() {
    if (completed) return;
    startTimerIfNeeded();
    setCurrentGuess((g) => g.slice(0, -1));
  }

  function submit() {
    if (completed) return;
    startTimerIfNeeded();

    if (!isValidGuess(currentGuess, WORDLE_WORD_LENGTH)) {
      triggerShake("Enter a 5-letter guess.");
      return;
    }

    const normalizedGuess = normalizeAlpha(currentGuess).slice(0, WORDLE_WORD_LENGTH);
    const evaluation = evaluateGuess({ guess: normalizedGuess, solution });

    // Append the row, update keyboard state, and clear the input.
    const nextIndex = rows.length;
    setRows((r) => [...r, { guess: normalizedGuess, evaluation }]);
    setKeyboard((k) => applyEvaluationToKeyboard(k, evaluation));
    setCurrentGuess("");
    setRevealRowIndex(nextIndex);

    if (normalizedGuess === solution) {
      setStatus("Correct! Nice work.");
      return;
    }

    if (nextIndex + 1 >= WORDLE_MAX_GUESSES) {
      setStatus(`Out of attempts. The word was ${solution.toUpperCase()}.`);
      return;
    }

    setStatus("Not quite. Try again.");
  }

  // Physical keyboard support (A–Z, Enter, Backspace)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Do not steal shortcuts (Cmd/Ctrl, Alt, etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }

      // Single letters
      if (e.key.length === 1) {
        const letter = e.key.toLowerCase();
        if (letter >= "a" && letter <= "z") {
          e.preventDefault();
          addLetter(letter);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function saveResult() {
    if (!completed) {
      setStatus("Finish the puzzle first, then save your result.");
      return;
    }

    setSaveState("saving");
    setStatus("Saving result to the LMS...");

    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          moduleId,
          score,
          completed: true,
          timeSeconds
        })
      });

      if (res.status === 401) {
        setSaveState("unauthorized");
        setStatus("You are not signed in. Sign in to save your result.");
        return;
      }

      if (!res.ok) {
        setSaveState("error");
        setStatus("Could not save result. Try again.");
        return;
      }

      setSaveState("saved");
      setStatus("Saved! You can return to the LMS dashboard.");
    } catch {
      setSaveState("error");
      setStatus("Network error while saving. Try again.");
    }
  }

  // Build the 6 rows for rendering: submitted rows + current input row + empties.
  const renderedRows = useMemo(() => {
    const output: Array<{ guess: string; evaluation: EvaluatedTile[] | null; rowIndex: number }> = [];
    for (let i = 0; i < WORDLE_MAX_GUESSES; i += 1) {
      if (i < rows.length) {
        output.push({ guess: rows[i]!.guess, evaluation: rows[i]!.evaluation, rowIndex: i });
      } else if (i === rows.length && !completed) {
        output.push({ guess: currentGuess, evaluation: null, rowIndex: i });
      } else {
        output.push({ guess: "", evaluation: null, rowIndex: i });
      }
    }
    return output;
  }, [completed, currentGuess, rows]);

  return (
    <div data-embed-page className="mx-auto w-full max-w-[44rem] px-4 py-5">
      <style>{`
        @keyframes gclms-wordle-shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          50% { transform: translateX(4px); }
          75% { transform: translateX(-3px); }
          100% { transform: translateX(0); }
        }

        @keyframes gclms-wordle-flip {
          0% { transform: rotateX(0deg); }
          49% { transform: rotateX(90deg); }
          50% { transform: rotateX(90deg); }
          100% { transform: rotateX(0deg); }
        }

        .gclms-wordle-flip {
          transform-style: preserve-3d;
          animation: gclms-wordle-flip 520ms ease-in-out both;
        }

        .gclms-wordle-shake {
          animation: gclms-wordle-shake 350ms ease-in-out;
        }
      `}</style>

      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_240px]">
        <Card className="p-4">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold">Cybersecurity Wordle</h1>
              <p className="mt-0.5 text-[13px] text-muted-fg">
                Guess the 5-letter cybersecurity word in 6 tries.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-fg">
              <span className="rounded-full border border-border bg-card px-2 py-0.5">
                Attempts:{" "}
                <span className="font-medium text-fg">
                  {Math.min(attemptsUsed + (completed ? 0 : 1), WORDLE_MAX_GUESSES)}/{WORDLE_MAX_GUESSES}
                </span>
              </span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5">
                Time: <span className="font-medium text-fg">{formatTime(timeSeconds)}</span>
              </span>
              {completed ? (
                <span className="rounded-full border border-border bg-card px-2 py-0.5">
                  Score: <span className="font-medium text-fg">{score}</span>
                </span>
              ) : null}
            </div>
          </div>

          {status ? (
            <div className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-fg">
              {status}
            </div>
          ) : null}

          <div className="mt-4 flex justify-center">
            <div className={shake ? "gclms-wordle-shake" : ""}>
              <div className="grid gap-2" style={{ gridTemplateRows: `repeat(${WORDLE_MAX_GUESSES}, 1fr)` }}>
                {renderedRows.map((row) => {
                  const guess = normalizeAlpha(row.guess).slice(0, WORDLE_WORD_LENGTH);
                  const evaluation = row.evaluation;

                  return (
                    <div key={row.rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${WORDLE_WORD_LENGTH}, 1fr)` }}>
                      {Array.from({ length: WORDLE_WORD_LENGTH }, (_, i) => {
                        const letter = guess[i]?.toUpperCase() ?? "";
                        const state = evaluation ? evaluation[i]?.state ?? null : null;

                        const shouldFlip =
                          evaluation != null &&
                          row.rowIndex === revealRowIndex &&
                          // Only flip once per row. If user continues typing, keep old animations.
                          true;

                        return (
                          <div
                            key={i}
                            className={[
                              "flex h-9 w-9 items-center justify-center rounded-md border text-[15px] font-semibold md:h-10 md:w-10",
                              tileClass(state),
                              shouldFlip ? "gclms-wordle-flip" : ""
                            ].join(" ")}
                            style={
                              shouldFlip
                                ? ({
                                    animationDelay: `${i * 110}ms`
                                  } as CSSProperties)
                                : undefined
                            }
                            aria-label={`Row ${row.rowIndex + 1} letter ${i + 1}`}
                          >
                            {letter}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            <div className="grid gap-2">
              {KEYBOARD_ROWS.map((row) => (
                <div key={row} className="flex justify-center gap-1.5">
                  {row.split("").map((ch) => {
                    const letter = ch.toLowerCase();
                    const state = keyboard[letter];
                    return (
                      <button
                        key={ch}
                        type="button"
                        className={[
                          "h-8 w-8 rounded-md border border-border text-[11px] font-semibold md:h-[2.05rem] md:w-[1.95rem]",
                          "hover:opacity-90 active:opacity-80",
                          keyClass(state)
                        ].join(" ")}
                        onClick={() => addLetter(letter)}
                        disabled={completed}
                        aria-label={`Letter ${ch}`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="mt-1 flex justify-center gap-1.5">
                <button
                  type="button"
                  className="h-8 rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold text-fg hover:bg-muted"
                  onClick={submit}
                  disabled={completed}
                >
                  Enter
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold text-fg hover:bg-muted"
                  onClick={backspace}
                  disabled={completed && currentGuess.length === 0}
                >
                  Backspace
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-fg">
              Word bank (training):{" "}
              <span className="font-medium text-fg">
                CYBER · PHISH · PATCH · VIRUS · ALERT · SPAMS
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Controls</h2>
          <p className="mt-1.5 text-[13px] text-muted-fg">
            Use your keyboard or the on-screen keys. When the puzzle ends, save your result to the LMS.
          </p>

          <div className="mt-3 grid gap-2">
            <Button type="button" variant="secondary" onClick={resetBoardSameSolution}>
              Reset board (same word)
            </Button>
            <Button type="button" variant="secondary" onClick={newGameReload}>
              New game (new word)
            </Button>
          </div>

          <div className="mt-5">
            <h3 className="font-semibold">Save result</h3>
            <p className="mt-1.5 text-[13px] text-muted-fg">
              This button is a fallback for standalone use. If this module is embedded in the LMS, it will also
              send a completion message automatically.
            </p>

            <div className="mt-3 space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={saveResult}
                disabled={!completed || saveState === "saving" || saveState === "saved"}
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved"
                    : "Save Result"}
              </Button>

              {saveState === "unauthorized" ? (
                <p className="text-[11px] text-muted-fg">
                  You need to sign in to save results. Open this module inside the LMS (or sign in in another tab).
                </p>
              ) : null}

              {completed ? (
                <p className="text-[11px] text-muted-fg">
                  Completion payload (sent via <code>postMessage</code>):{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {
                      "{ type: \"MODULE_COMPLETE\", moduleId, score, attemptsUsed, success, solutionWord, timeSeconds }"
                    }
                  </code>
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
