"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CyberCrushBoard } from "@/components/CyberCrushBoard";
import {
  areAdjacent,
  createInitialPlayableBoard,
  createSeededRandom,
  findMatchGroups,
  hasPlayableMove,
  resolveBoardCascades,
  swapBoardCells,
  type CyberCrushBoard as CyberCrushBoardState,
  type CyberCrushCell,
  type CyberCrushTile
} from "@/lib/cyberCrushEngine";
import type { CyberCrushLevelPresentation } from "@/lib/cyberCrushLevelData";

/**
 * What this file does
 * - Implements the full Cyber Crush game flow on the client:
 *   - level setup
 *   - tile selection / swap handling
 *   - score + move tracking
 *   - level progression
 *   - LMS completion reporting
 *
 * How swaps are validated
 * - The player clicks one tile, then a neighboring tile.
 * - If the tiles are not adjacent, we simply move the selection.
 * - If they are adjacent:
 *   1) temporarily swap them
 *   2) check whether that creates any 3+ match
 *   3) if not, animate the swap back (invalid move)
 *   4) if yes, keep the move and resolve cascades
 *
 * How matches are found
 * - We use the pure engine in `src/lib/cyberCrushEngine.ts`.
 * - It scans rows and columns for runs of 3 or more identical tiles.
 *
 * How cascades/refills work
 * - After a valid swap, the engine returns step-by-step cascade data:
 *   - which cells matched
 *   - the board after clearing
 *   - the board after collapsing/refilling
 * - We play those steps in sequence with short waits so the board feels smooth.
 *
 * How LMS completion reporting works
 * - When the game fully ends (win or loss), we send:
 *   `window.parent.postMessage({ type: "MODULE_COMPLETE", moduleId, score, success, levelsCompleted, movesUsed, timeSeconds }, "*")`
 * - If `embed=true`, this happens automatically once.
 * - A fallback "Save Result" button also POSTs to `/api/attempts`.
 */

type CompletionPayload = {
  type: "MODULE_COMPLETE";
  moduleId: string;
  score: number;
  success: boolean;
  levelsCompleted: number;
  movesUsed: number;
  timeSeconds: number;
};

type CompletionState = {
  success: boolean;
  levelsCompleted: number;
} | null;

const BOARD_ROWS = 8;
const BOARD_COLS = 8;
const MAX_CASCADE_STEPS = 10;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function scoreForCascade(params: { clearedCount: number; cascadeIndex: number }) {
  /**
   * Scoring philosophy (plain English)
   * - We lowered scoring so a normal 3-match does not blow through the target too fast.
   * - A basic 3-match is worth a modest amount.
   * - Each extra tile above 3 adds a meaningful bonus.
   * - Cascades still matter, but the bonus is gentle instead of huge.
   *
   * Examples
   * - 3 tiles in one match: 90 points
   * - 4 tiles in one match: 135 points
   * - 5 tiles in one match: 180 points
   * - Later cascades add a 25% bump each step.
   */
  const baseMatchScore = 90;
  const extraTileBonus = 45;
  const extraTiles = Math.max(0, params.clearedCount - 3);
  const rawScore = baseMatchScore + extraTiles * extraTileBonus;
  const cascadeMultiplier = 1 + params.cascadeIndex * 0.25;

  return Math.round(rawScore * cascadeMultiplier);
}

export function CyberCrushGame(props: {
  moduleId: string;
  embed: boolean;
  levels: CyberCrushLevelPresentation[];
  randomSeed: number;
  userId?: string;
}) {
  const moduleId = props.moduleId;
  const embed = props.embed;
  const levels = props.levels;

  const randomRef = useRef(createSeededRandom(props.randomSeed));
  const tileCounterRef = useRef(0);
  const mountedRef = useRef(true);
  const postedRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const createTile = useCallback((kind: string): CyberCrushTile => {
    tileCounterRef.current += 1;
    return {
      id: `cyber-crush-${tileCounterRef.current}`,
      kind
    };
  }, []);

  const buildBoardForLevel = useCallback((levelIndex: number) => {
    const level = levels[levelIndex]!;
    return createInitialPlayableBoard({
      rows: BOARD_ROWS,
      cols: BOARD_COLS,
      tileKinds: level.tiles.map((tile) => tile.kind),
      random: randomRef.current,
      createTile
    });
  }, [createTile, levels]);

  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [board, setBoard] = useState<CyberCrushBoardState>(() => buildBoardForLevel(0));
  const [selectedCell, setSelectedCell] = useState<CyberCrushCell | null>(null);
  const [matchedCells, setMatchedCells] = useState<CyberCrushCell[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(
    "Match 3 or more tiles to reach the target score."
  );

  const [levelScore, setLevelScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [levelMovesUsed, setLevelMovesUsed] = useState(0);
  const [totalMovesUsed, setTotalMovesUsed] = useState(0);
  const [levelsCompleted, setLevelsCompleted] = useState(0);
  const [completion, setCompletion] = useState<CompletionState>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error" | "unauthorized"
  >("idle");
  const currentLevel = levels[currentLevelIndex]!;
  const movesLeft = Math.max(0, currentLevel.moveLimit - levelMovesUsed);
  const completedGame = completion !== null;
  const levelGoalReached =
    !completedGame &&
    currentLevelIndex < levels.length - 1 &&
    levelScore >= currentLevel.targetScore;

  // Refs keep the latest values available inside async animation flows.
  const levelScoreRef = useRef(levelScore);
  const totalScoreRef = useRef(totalScore);
  const levelMovesUsedRef = useRef(levelMovesUsed);
  const totalMovesUsedRef = useRef(totalMovesUsed);
  const levelsCompletedRef = useRef(levelsCompleted);

  useEffect(() => {
    levelScoreRef.current = levelScore;
  }, [levelScore]);
  useEffect(() => {
    totalScoreRef.current = totalScore;
  }, [totalScore]);
  useEffect(() => {
    levelMovesUsedRef.current = levelMovesUsed;
  }, [levelMovesUsed]);
  useEffect(() => {
    totalMovesUsedRef.current = totalMovesUsed;
  }, [totalMovesUsed]);
  useEffect(() => {
    levelsCompletedRef.current = levelsCompleted;
  }, [levelsCompleted]);

  // ----- Timer state (starts on first successful interaction) -----
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

  useEffect(() => {
    if (!embed || !completion || postedRef.current) return;

    postedRef.current = true;
    const payload: CompletionPayload = {
      type: "MODULE_COMPLETE",
      moduleId,
      score: totalScoreRef.current,
      success: completion.success,
      levelsCompleted: completion.levelsCompleted,
      movesUsed: totalMovesUsedRef.current,
      timeSeconds
    };

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        setStatus("Cyber Crush finished. Result sent to the LMS.");
      }
    } catch {
      setStatus("Cyber Crush finished. (Could not message the parent LMS. You can still save the result.)");
    }
  }, [completion, embed, moduleId, timeSeconds]);

  function finishGame(nextCompletion: CompletionState, message: string) {
    if (!nextCompletion) return;
    setCompletion(nextCompletion);
    setEndedAtMs((current) => current ?? Date.now());
    setSelectedCell(null);
    setMatchedCells([]);
    setBusy(false);
    setStatus(message);
  }

  function advanceToNextLevel() {
    if (busy || completedGame) return;
    if (currentLevelIndex >= levels.length - 1) return;

    const nextIndex = currentLevelIndex + 1;
    setBusy(true);

    try {
      const nextBoard = buildBoardForLevel(nextIndex);
      setCurrentLevelIndex(nextIndex);
      setBoard(nextBoard);
      setLevelScore(0);
      levelScoreRef.current = 0;
      setLevelMovesUsed(0);
      levelMovesUsedRef.current = 0;
      setSelectedCell(null);
      setMatchedCells([]);
      setStatus(
        `Level ${nextIndex + 1} started. ${levels[nextIndex]?.objectiveLabel ?? "Match quickly and reach the target score."}`
      );
    } catch (error) {
      console.error("[Cyber Crush] Could not start next level", error);
      setStatus("Level 2 could not start cleanly, so the board stayed on the current level. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function restartGame() {
    randomRef.current = createSeededRandom(props.randomSeed);
    tileCounterRef.current = 0;
    postedRef.current = false;

    setCurrentLevelIndex(0);
    setBoard(buildBoardForLevel(0));
    setSelectedCell(null);
    setMatchedCells([]);
    setBusy(false);
    setStatus("Match 3 or more tiles to reach the target score.");
    setLevelScore(0);
    levelScoreRef.current = 0;
    setTotalScore(0);
    totalScoreRef.current = 0;
    setLevelMovesUsed(0);
    levelMovesUsedRef.current = 0;
    setTotalMovesUsed(0);
    totalMovesUsedRef.current = 0;
    setLevelsCompleted(0);
    levelsCompletedRef.current = 0;
    setCompletion(null);
    setSaveState("idle");
    setStartedAtMs(null);
    setEndedAtMs(null);
  }

  function newGame() {
    window.location.reload();
  }

  function ensurePlayableBoardOrRefresh(levelIndex: number, boardToCheck: CyberCrushBoardState) {
    if (hasPlayableMove(boardToCheck)) return boardToCheck;

    // A board with no valid moves is frustrating. For MVP polish, we simply refresh it.
    setStatus("No moves left on the board. Shuffling fresh tiles...");
    return buildBoardForLevel(levelIndex);
  }

  function handleValidSwap(swappedBoard: CyberCrushBoardState) {
    const nextLevelMovesUsed = levelMovesUsedRef.current + 1;
    const nextTotalMovesUsed = totalMovesUsedRef.current + 1;

    setLevelMovesUsed(nextLevelMovesUsed);
    levelMovesUsedRef.current = nextLevelMovesUsed;
    setTotalMovesUsed(nextTotalMovesUsed);
    totalMovesUsedRef.current = nextTotalMovesUsed;

    const resolved = resolveBoardCascades({
      board: swappedBoard,
      rows: BOARD_ROWS,
      cols: BOARD_COLS,
      tileKinds: currentLevel.tiles.map((tile) => tile.kind),
      random: randomRef.current,
      createTile,
      maxSteps: MAX_CASCADE_STEPS
    });

    const moveScore = resolved.steps.reduce(
      (total, step, stepIndex) =>
        total +
        scoreForCascade({
          clearedCount: step.clearedCount,
          cascadeIndex: stepIndex
        }),
      0
    );

    const firstMatchedCells = resolved.steps[0]?.matchedCells ?? [];
    if (firstMatchedCells.length > 0) {
      setMatchedCells(firstMatchedCells);
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setMatchedCells([]);
      }, 140);
    }

    let finalBoard = resolved.finalBoard;
    let refreshedAfterLongCascade = false;

    if (resolved.didHitMaxSteps) {
      /**
       * Why we do this
       * - A very long cascade feels like the game froze because input stays locked
       *   while the animation chain plays out.
       * - We cap the chain length for smoothness, then refresh to a safe playable board.
       */
      refreshedAfterLongCascade = true;
      setStatus("Big chain detected. Refreshing the board so play stays smooth...");
      finalBoard = buildBoardForLevel(currentLevelIndex);
    } else {
      finalBoard = ensurePlayableBoardOrRefresh(currentLevelIndex, finalBoard);
    }

    setMatchedCells([]);
    setBoard(finalBoard);

    const nextLevelScore = levelScoreRef.current + moveScore;
    const nextTotalScore = totalScoreRef.current + moveScore;
    setLevelScore(nextLevelScore);
    levelScoreRef.current = nextLevelScore;
    setTotalScore(nextTotalScore);
    totalScoreRef.current = nextTotalScore;

    if (nextLevelScore >= currentLevel.targetScore) {
      const nextLevelsCompleted = Math.max(levelsCompletedRef.current, currentLevelIndex + 1);
      setLevelsCompleted(nextLevelsCompleted);
      levelsCompletedRef.current = nextLevelsCompleted;

      if (currentLevelIndex === levels.length - 1) {
        finishGame(
          {
            success: true,
            levelsCompleted: nextLevelsCompleted
          },
          "Mission complete. You cleared both Cyber Crush levels."
        );
        return;
      }

      setBusy(false);
      setSelectedCell(null);
      setStatus("Target reached! Use the Start Level 2 button below to continue.");
      return;
    }

    if (nextLevelMovesUsed >= currentLevel.moveLimit) {
      finishGame(
        {
          success: false,
          levelsCompleted: levelsCompletedRef.current
        },
        `Out of moves. You needed ${currentLevel.targetScore} points in ${currentLevel.title.toLowerCase()}.`
      );
      return;
    }

    setBusy(false);
    setSelectedCell(null);
    setStatus(
      refreshedAfterLongCascade
        ? "Nice move. The board was refreshed after a long chain, and you can keep playing."
        : "Nice move. Keep matching to reach the target score."
    );
  }

  function trySwap(first: CyberCrushCell, second: CyberCrushCell) {
    if (busy || completedGame) return;
    if (!areAdjacent(first, second)) return;

    startTimerIfNeeded();
    setSelectedCell(null);

    const originalBoard = board;
    try {
      const swappedBoard = swapBoardCells(originalBoard, first, second);
      const createdMatch = findMatchGroups(swappedBoard).length > 0;
      if (!createdMatch) {
        setStatus("That swap doesn't create a match.");
        setMatchedCells([]);
        setBoard(originalBoard);
        return;
      }

      setBoard(swappedBoard);
      handleValidSwap(swappedBoard);
    } catch (error) {
      console.error("[Cyber Crush] Move resolution failed", error);
      setBoard(originalBoard);
      setMatchedCells([]);
      setStatus("That move hit an unexpected problem, so the board was restored. Please try again.");
    }
  }

  function handleTileClick(cell: CyberCrushCell) {
    if (busy || completedGame) return;

    if (!selectedCell) {
      setSelectedCell(cell);
      return;
    }

    if (selectedCell.row === cell.row && selectedCell.col === cell.col) {
      setSelectedCell(null);
      return;
    }

    if (!areAdjacent(selectedCell, cell)) {
      setSelectedCell(cell);
      setStatus("Select a neighboring tile to swap.");
      return;
    }

    trySwap(selectedCell, cell);
  }

  async function saveResult() {
    if (!completion) {
      setStatus("Finish the game first, then save your result.");
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
          score: totalScoreRef.current,
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

  const progressPercent = Math.min(100, Math.round((levelScore / currentLevel.targetScore) * 100));
  const levelsList = useMemo(
    () =>
      levels.map((level, index) => ({
        ...level,
        state:
          index < levelsCompleted
            ? "complete"
            : index === currentLevelIndex
              ? "current"
              : "upcoming"
      })),
    [currentLevelIndex, levels, levelsCompleted]
  );

  return (
    <main data-embed-page className="mx-auto w-full max-w-[58rem] px-4 py-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <section className="space-y-4">
          {/**
           * Compact support panels, large board
           * - The board area stays roomy.
           * - The summary cards and helper panels are tightened so more of the
           *   actual match-3 playfield stays visible.
           */}
          <Card className="overflow-hidden border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,247,250,0.95))] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-fg">
                  Cyber Crush
                </p>
                <h1 className="mt-1.5 font-serif text-2xl font-semibold tracking-tight text-fg">
                  Match threats. Learn defenses.
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-muted-fg">
                  Clear the board by making 3-match combos. Finish the malware level,
                  then protect the system in the security level.
                </p>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Score</p>
                  <p className="mt-0.5 text-xl font-semibold">{totalScore}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Moves Used</p>
                  <p className="mt-0.5 text-xl font-semibold">{totalMovesUsed}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Time</p>
                  <p className="mt-0.5 text-xl font-semibold">{formatTime(timeSeconds)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_210px]">
              <div className="rounded-2xl border border-border bg-card/80 px-3.5 py-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">
                      {currentLevel.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-fg">{currentLevel.subtitle}</p>
                  </div>
                  <div className="text-[13px] text-muted-fg">
                    Moves left: <span className="font-semibold text-fg">{movesLeft}</span>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-fg">
                    <span>Target Progress</span>
                    <span>
                      {levelScore} / {currentLevel.targetScore}
                    </span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={[
                        "h-full rounded-full transition-[width] duration-300",
                        levelGoalReached ? "bg-emerald-500" : "bg-accent"
                      ].join(" ")}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-fg">
                    {levelGoalReached ? "Target reached — level complete." : currentLevel.objectiveLabel}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/80 px-3.5 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Levels</p>
                <div className="mt-2.5 space-y-1.5">
                  {levelsList.map((level, index) => (
                    <div
                      key={level.id}
                      className={[
                        "rounded-xl border px-2.5 py-2 text-sm",
                        level.state === "complete"
                          ? "border-accent/40 bg-accent/5"
                          : level.state === "current"
                            ? "border-accent-2/40 bg-accent-2/10"
                            : "border-border bg-muted/50"
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{level.title}</span>
                        <span className="text-xs uppercase tracking-[0.18em] text-muted-fg">
                          {level.state === "complete"
                            ? "Done"
                            : level.state === "current"
                              ? "Active"
                              : `Level ${index + 1}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {status ? (
              <div className="mt-3 rounded-2xl border border-border bg-muted/70 px-3 py-2.5 text-sm text-fg">
                {status}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Controls</h2>
            <p className="mt-1.5 text-sm text-muted-fg">
              Click one tile, then a neighboring tile, to attempt a swap. Only swaps
              that create a match will count as moves.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid gap-2">
                {currentLevelIndex < levels.length - 1 && levelScore >= currentLevel.targetScore ? (
                  <Button type="button" onClick={() => void advanceToNextLevel()} disabled={busy}>
                    Start Level {currentLevelIndex + 2}
                  </Button>
                ) : null}

                <Button type="button" variant="secondary" onClick={restartGame} disabled={busy}>
                  Restart same run
                </Button>
                <Button type="button" variant="secondary" onClick={newGame} disabled={busy}>
                  New random run
                </Button>
              </div>

              <div>
                <h3 className="font-semibold">Save result</h3>
                <p className="mt-1.5 text-sm text-muted-fg">
                  When the game finishes, this button saves your score using the same
                  attempts API as the other native LMS modules.
                </p>

                <div className="mt-3 space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void saveResult()}
                    disabled={!completion || saveState === "saving" || saveState === "saved"}
                  >
                    {saveState === "saving"
                      ? "Saving..."
                      : saveState === "saved"
                        ? "Saved"
                        : "Save Result"}
                  </Button>

                  {saveState === "unauthorized" ? (
                    <p className="text-xs text-muted-fg">
                      You need to sign in to save results. Open this module inside the LMS (or sign in in another tab).
                    </p>
                  ) : null}

                  {completion ? (
                    <p className="text-xs text-muted-fg">
                      Completion payload:{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        {
                          "{ type: \"MODULE_COMPLETE\", moduleId, score, success, levelsCompleted, movesUsed, timeSeconds }"
                        }
                      </code>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          {levelGoalReached ? (
            <Card className="border-emerald-300 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-emerald-900">Target score reached</h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    Great job — Level 1 is complete. Start Level 2 to switch to the security icons board.
                  </p>
                </div>

                <Button type="button" onClick={advanceToNextLevel} disabled={busy}>
                  Start Level 2
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="p-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-fg">
                  Gameplay Tracker
                </p>
                <p className="mt-0.5 text-sm text-muted-fg">
                  Keep an eye on your move budget while you chase the target score.
                </p>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Moves Used</p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {levelMovesUsed} / {currentLevel.moveLimit}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Moves Left</p>
                  <p className="mt-0.5 text-lg font-semibold">{movesLeft}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-fg">Level Score</p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {levelScore} / {currentLevel.targetScore}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <CyberCrushBoard
            board={board}
            tiles={currentLevel.tiles}
            selectedCell={selectedCell}
            matchedCells={matchedCells}
            disabled={busy || completedGame || levelGoalReached}
            onTileClick={(cell) => {
              void handleTileClick(cell);
            }}
          />
        </section>

        <aside className="space-y-5">
          <Card className="p-5">
            <h2 className="font-semibold">Level Guide</h2>
            <p className="mt-2 text-sm text-muted-fg">
              Learn what each icon means while you play. Missing art files safely fall
              back to labeled tiles, so the game keeps working even without custom icons.
            </p>

            <div className="mt-4 space-y-3">
              {currentLevel.tiles.map((tile) => (
                <div
                  key={tile.kind}
                  className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-2xl border border-border bg-card p-3"
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-xs font-semibold uppercase tracking-[0.12em] text-white"
                    style={{ backgroundImage: tile.fallbackGradient }}
                  >
                    {tile.shortLabel}
                  </div>
                  <div>
                    <p className="font-medium text-fg">{tile.label}</p>
                    <p className="mt-1 text-sm text-muted-fg">{tile.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}
