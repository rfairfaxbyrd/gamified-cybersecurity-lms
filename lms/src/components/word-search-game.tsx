"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WordSearchCell, WordSearchPuzzle } from "@/lib/wordSearchGenerator";

/**
 * What this file does
 * - Implements the interactive "Cybersecurity Word Search" mini-game UI:
 *   - letter grid rendering
 *   - click/drag (mouse) selection
 *   - tap start/end (mobile-friendly) selection
 *   - hint + reset controls
 *   - timer + scoring
 *   - completion reporting to the LMS (postMessage + optional API save)
 *
 * Key concepts (plain English)
 * - The puzzle generator gives us two things:
 *   1) `grid`     → the letters the user sees
 *   2) `placements` → the answer key (exact cells each word occupies)
 * - During play, we compare the user's selected cells against the answer key.
 *   If the path matches a placed word (forward OR backward), the word is "found".
 *
 * How word selection works
 * - Mouse (desktop):
 *   - click and drag across the grid
 * - Touch (mobile):
 *   - tap a start cell, then tap an end cell
 *
 * How we validate a selected word
 * - We turn a list of cells into a simple "signature" string: "r,c|r,c|r,c..."
 * - The generator gives us the exact signatures for every placed word.
 * - If the user's signature matches, it's a correct find.
 *
 * How we send completion to the LMS
 * - When all words are found, we compute a score and set `completed`.
 * - If `embed=true` we also send:
 *   window.parent.postMessage({ type: "MODULE_COMPLETE", ... }, "*")
 * - We also show a "Save Result" button that POSTs to `/api/attempts`.
 *
 * How to change words / grid size / scoring
 * - Words and grid size are configured in the page that calls the generator.
 * - Scoring is in `computeScore()` below.
 */

type CompletionPayload = {
  type: "MODULE_COMPLETE";
  moduleId: string;
  score: number;
  timeSeconds: number;
  hintsUsed: number;
  foundWords: number;
  totalWords: number;
};

function cellKey(cell: WordSearchCell) {
  return `${cell.row},${cell.col}`;
}

function signature(cells: WordSearchCell[]) {
  return cells.map(cellKey).join("|");
}

function reverseCells(cells: WordSearchCell[]) {
  return [...cells].reverse();
}

function sign(n: number) {
  if (n === 0) return 0;
  return n > 0 ? 1 : -1;
}

/**
 * Given a start and end cell, compute the straight line of cells between them.
 * - Valid lines are the 8 typical word-search directions.
 * - If start/end are not aligned, we return just `[start]` (prevents weird zig-zags).
 */
function lineCells(start: WordSearchCell, end: WordSearchCell) {
  const dr = end.row - start.row;
  const dc = end.col - start.col;

  if (dr === 0 && dc === 0) return [start];

  // Horizontal
  if (dr === 0) {
    const stepCol = sign(dc);
    const len = Math.abs(dc) + 1;
    return Array.from({ length: len }, (_, i) => ({
      row: start.row,
      col: start.col + stepCol * i
    }));
  }

  // Vertical
  if (dc === 0) {
    const stepRow = sign(dr);
    const len = Math.abs(dr) + 1;
    return Array.from({ length: len }, (_, i) => ({
      row: start.row + stepRow * i,
      col: start.col
    }));
  }

  // Diagonal
  if (Math.abs(dr) === Math.abs(dc)) {
    const stepRow = sign(dr);
    const stepCol = sign(dc);
    const len = Math.abs(dr) + 1;
    return Array.from({ length: len }, (_, i) => ({
      row: start.row + stepRow * i,
      col: start.col + stepCol * i
    }));
  }

  return [start];
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function computeScore(params: { hintsUsed: number; wrongAttempts: number }) {
  // Scoring rules (MVP, easy to explain):
  // - Start at 100 points.
  // - -5 points per hint.
  // - -2 points per wrong attempt, capped at -20 total (so mistakes don't zero you out).
  const hintPenalty = params.hintsUsed * 5;
  const wrongPenalty = Math.min(params.wrongAttempts * 2, 20);
  return Math.max(0, 100 - hintPenalty - wrongPenalty);
}

export function WordSearchGame(props: {
  moduleId: string;
  puzzle: WordSearchPuzzle;
  embed: boolean;
  userId?: string;
}) {
  const { moduleId, puzzle, embed } = props;

  // ----- Timer state (starts on first interaction) -----
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!startedAtMs) return;
    if (endedAtMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs, endedAtMs]);

  // We intentionally compute this value during render.
  // The `tick` state above forces a re-render every second while the timer is running.
  const timeSeconds =
    startedAtMs == null
      ? 0
      : Math.max(0, Math.floor(((endedAtMs ?? Date.now()) - startedAtMs) / 1000));

  function startTimerIfNeeded() {
    if (!startedAtMs) setStartedAtMs(Date.now());
  }

  // ----- Word/key maps for fast validation -----
  const signatureToWordKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [wordKey, placement] of Object.entries(puzzle.placements)) {
      const forward = signature(placement.cells);
      const backward = signature(reverseCells(placement.cells));
      map.set(forward, wordKey);
      map.set(backward, wordKey);
    }
    return map;
  }, [puzzle.placements]);

  // ----- Progress state -----
  const totalWords = puzzle.words.length;
  const [foundKeys, setFoundKeys] = useState<string[]>([]);
  const foundSet = useMemo(() => new Set(foundKeys), [foundKeys]);

  const foundWords = foundKeys.length;
  const completed = foundWords === totalWords;

  // Derived: which grid cells are permanently highlighted because they belong to found words.
  const foundCellSet = useMemo(() => {
    const set = new Set<string>();
    for (const key of foundKeys) {
      const placement = puzzle.placements[key];
      if (!placement) continue;
      for (const cell of placement.cells) set.add(cellKey(cell));
    }
    return set;
  }, [foundKeys, puzzle.placements]);

  // ----- Selection state -----
  const [selectionStart, setSelectionStart] = useState<WordSearchCell | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<WordSearchCell | null>(null);
  const activeCells = useMemo(() => {
    if (!selectionStart || !selectionEnd) return [];
    return lineCells(selectionStart, selectionEnd);
  }, [selectionStart, selectionEnd]);

  const [tapAnchor, setTapAnchor] = useState<WordSearchCell | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);

  // Feedback UI (simple + friendly)
  const [status, setStatus] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Hint highlight (first letter of a remaining word)
  const [hintCellKey, setHintCellKey] = useState<string | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

  // Pointer tracking for drag selection
  const pointerIdRef = useRef<number | null>(null);
  const pointerTypeRef = useRef<string | null>(null);
  const movedRef = useRef(false);

  // Completion reporting / saving
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "unauthorized">("idle");
  const postedRef = useRef(false);

  // If this module is inside an iframe, allow it to hide the LMS chrome for a tighter embed.
  useEffect(() => {
    if (!embed) return;
    document.body.classList.add("gclms-embed");
    return () => {
      document.body.classList.remove("gclms-embed");
    };
  }, [embed]);

  function clearHintHighlight() {
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    setHintCellKey(null);
  }

  function resetGame() {
    setFoundKeys([]);
    setSelectionStart(null);
    setSelectionEnd(null);
    setTapAnchor(null);
    setWrongAttempts(0);
    setHintsUsed(0);
    setStatus(null);
    setShake(false);
    clearHintHighlight();
    setSaveState("idle");
    postedRef.current = false;
    setStartedAtMs(null);
    setEndedAtMs(null);
  }

  function triggerShake(message: string) {
    setStatus(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 250);
  }

  function markWordFound(wordKey: string) {
    if (foundSet.has(wordKey)) return;
    setFoundKeys((prev) => [...prev, wordKey]);
  }

  function finalizeSelection(cells: WordSearchCell[]) {
    if (cells.length < 2) {
      triggerShake("Select at least 2 letters.");
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    const sig = signature(cells);
    const wordKey = signatureToWordKey.get(sig);
    if (!wordKey) {
      setWrongAttempts((n) => n + 1);
      triggerShake("Not a valid word. Try again.");
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    if (foundSet.has(wordKey)) {
      setStatus("You already found that word.");
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    markWordFound(wordKey);
    setStatus(`Found: ${puzzle.placements[wordKey]?.display ?? wordKey}`);
    setSelectionStart(null);
    setSelectionEnd(null);
    clearHintHighlight();
  }

  function handleHint() {
    startTimerIfNeeded();

    const remaining = puzzle.words.filter((w) => !foundSet.has(w.key));
    if (remaining.length === 0) return;

    const nextWord = remaining[0];
    const placement = puzzle.placements[nextWord.key];
    if (!placement) return;

    setHintsUsed((n) => n + 1);
    setStatus(`Hint: the first letter of "${placement.display}" is highlighted.`);

    const firstCell = placement.cells[0];
    setHintCellKey(cellKey(firstCell));

    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => {
      setHintCellKey(null);
      hintTimeoutRef.current = null;
    }, 5000);
  }

  const score = useMemo(() => computeScore({ hintsUsed, wrongAttempts }), [hintsUsed, wrongAttempts]);

  // When the last word is found, freeze the timer once and report completion (embed mode).
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
      timeSeconds,
      hintsUsed,
      foundWords,
      totalWords
    };

    // postMessage contract:
    // - We send to the parent window (the LMS) and allow any origin ("*") because:
    //   - some LMS deployments may be behind tunnels / different hostnames
    //   - this module does not contain secrets (it only reports score + timing)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        setStatus("Completed! Result sent to the LMS.");
      }
    } catch {
      // If postMessage fails (rare), the user can still click "Save Result".
      setStatus("Completed! (Could not message the parent LMS. You can still save the result.)");
    }
  }, [completed, embed, endedAtMs, foundWords, hintsUsed, moduleId, score, timeSeconds, totalWords]);

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
          // Extra analytics fields (MVP may ignore these, but they are useful).
          timeSeconds,
          hintsUsed,
          foundWords,
          totalWords
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

  // ----- Pointer / tap handlers -----
  function beginSelection(cell: WordSearchCell, pointerId: number, pointerType: string) {
    startTimerIfNeeded();
    pointerIdRef.current = pointerId;
    pointerTypeRef.current = pointerType;
    movedRef.current = false;
    setSelectionStart(cell);
    setSelectionEnd(cell);
  }

  function endSelection() {
    const pointerType = pointerTypeRef.current;
    const moved = movedRef.current;
    const start = selectionStart;
    const end = selectionEnd;

    pointerIdRef.current = null;
    pointerTypeRef.current = null;
    movedRef.current = false;

    // Mobile-friendly two-tap mode:
    // - If it's a touch pointer and the user didn't drag, treat it as a "tap".
    if (pointerType === "touch" && start && end && !moved) {
      if (!tapAnchor) {
        setTapAnchor(start);
        setStatus("Tap an end letter to select a word.");
        return;
      }

      const cells = lineCells(tapAnchor, end);
      setTapAnchor(null);
      finalizeSelection(cells);
      return;
    }

    if (start && end) finalizeSelection(lineCells(start, end));
  }

  function cellFromElement(el: Element | null): WordSearchCell | null {
    let node: Element | null = el;
    while (node) {
      const r = (node as HTMLElement).dataset?.row;
      const c = (node as HTMLElement).dataset?.col;
      if (r != null && c != null) {
        const row = Number(r);
        const col = Number(c);
        if (Number.isFinite(row) && Number.isFinite(col)) return { row, col };
      }
      node = node.parentElement;
    }
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <style>{`
        @keyframes gclms-shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          50% { transform: translateX(3px); }
          75% { transform: translateX(-3px); }
          100% { transform: translateX(0); }
        }
      `}</style>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Cybersecurity Word Search</h1>
          <p className="text-sm text-muted-fg">
            Find all {totalWords} words. Drag to select (desktop) or tap start/end (mobile).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-border bg-card px-3 py-1 text-muted-fg">
            Variant {puzzle.variant + 1}/5
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-muted-fg">
            Time: <span className="font-medium text-fg">{formatTime(timeSeconds)}</span>
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-muted-fg">
            Score: <span className="font-medium text-fg">{score}</span>
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-fg">
              Words found:{" "}
              <span className="font-medium text-fg">
                {foundWords}/{totalWords}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={handleHint}>
                Hint (-5)
              </Button>
              <Button type="button" variant="secondary" onClick={resetGame}>
                Reset
              </Button>
            </div>
          </div>

          {status ? (
            <div className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm text-fg">
              {status}
            </div>
          ) : null}

          <div
            className="mt-4 inline-block rounded-lg border border-border bg-card p-3"
            style={{
              animation: shake ? "gclms-shake 0.25s" : undefined,
              touchAction: "none" // allows pointermove tracking in the grid on mobile
            }}
            onPointerMove={(e) => {
              const activeId = pointerIdRef.current;
              if (activeId == null || e.pointerId !== activeId) return;

              const target = document.elementFromPoint(e.clientX, e.clientY);
              const cell = cellFromElement(target);
              if (!cell) return;

              // If the cell changed, we treat it as a drag movement.
              const prev = selectionEnd;
              if (!prev || prev.row !== cell.row || prev.col !== cell.col) {
                movedRef.current = true;
                setSelectionEnd(cell);
              }
            }}
            onPointerUp={(e) => {
              const activeId = pointerIdRef.current;
              if (activeId == null || e.pointerId !== activeId) return;
              endSelection();
            }}
            onPointerCancel={(e) => {
              const activeId = pointerIdRef.current;
              if (activeId == null || e.pointerId !== activeId) return;
              endSelection();
            }}
          >
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`
              }}
            >
              {puzzle.grid.map((row, r) =>
                row.map((letter, c) => {
                  const key = `${r}-${c}`;
                  const k = `${r},${c}`;

                  const inFound = foundCellSet.has(k);
                  const inActive = activeCells.some((cell) => cell.row === r && cell.col === c);
                  const isHint = hintCellKey === k;

                  return (
                    <button
                      key={key}
                      type="button"
                      data-row={r}
                      data-col={c}
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold",
                        "select-none",
                        inFound
                          ? "border-accent bg-accent/10 text-fg"
                          : "border-border bg-bg text-fg hover:bg-muted",
                        inActive && !inFound ? "bg-muted" : "",
                        isHint ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""
                      ].join(" ")}
                      onPointerDown={(e) => {
                        // Only handle one active pointer at a time.
                        if (pointerIdRef.current != null) return;
                        beginSelection({ row: r, col: c }, e.pointerId, e.pointerType);
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      }}
                      onPointerEnter={() => {
                        // Mouse convenience: entering a cell while dragging updates the end.
                        if (pointerTypeRef.current !== "mouse") return;
                        if (pointerIdRef.current == null) return;
                        movedRef.current = true;
                        setSelectionEnd({ row: r, col: c });
                      }}
                    >
                      {letter}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Word list</h2>
          <p className="mt-1 text-sm text-muted-fg">
            Words appear forward/backward, vertical, and diagonal.
          </p>

          <ul className="mt-4 space-y-2 text-sm">
            {puzzle.words.map((w) => {
              const found = foundSet.has(w.key);
              return (
                <li
                  key={w.key}
                  className={[
                    "flex items-center justify-between rounded-md border px-3 py-2",
                    found ? "border-accent/50 bg-accent/5" : "border-border bg-card"
                  ].join(" ")}
                >
                  <span className={found ? "line-through text-muted-fg" : "text-fg"}>
                    {w.display}
                  </span>
                  {found ? (
                    <span className="text-xs font-medium text-accent">Found</span>
                  ) : (
                    <span className="text-xs text-muted-fg">—</span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-2">
            <div className="text-sm text-muted-fg">
              Hints used: <span className="font-medium text-fg">{hintsUsed}</span>
            </div>
            <div className="text-sm text-muted-fg">
              Wrong attempts: <span className="font-medium text-fg">{wrongAttempts}</span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
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
              <p className="text-xs text-muted-fg">
                You need to sign in to save results. Open this module inside the LMS (or sign in in another tab).
              </p>
            ) : null}

            {completed ? (
              <p className="text-xs text-muted-fg">
                Completion payload:{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  {"{ type: \"MODULE_COMPLETE\", moduleId, score, timeSeconds, hintsUsed, foundWords, totalWords }"}
                </code>
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
