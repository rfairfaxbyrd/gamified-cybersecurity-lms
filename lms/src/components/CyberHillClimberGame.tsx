"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CyberHillScene, type CyberHillScenePhase } from "@/components/CyberHillScene";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  computeCyberHillScore,
  formatStageLabel,
  getCorrectChoice,
  getPresentedChoices
} from "@/lib/cyberHillGameLogic";
import type { CyberHillQuestion } from "@/lib/cyberHillQuestions";

/**
 * What this file does
 * - Implements the full playable Cyber Hill Climber experience.
 * - It controls:
 *   - the start screen
 *   - question flow
 *   - answer checking
 *   - climb / fall animations
 *   - game over and victory states
 *   - LMS completion reporting
 *
 * How the game flow works
 * - Start at the base of the mountain.
 * - Answer one 2-choice cybersecurity question per stage.
 * - Correct answer -> climb up one section.
 * - Wrong answer -> slip and fall, ending the run.
 * - Answer all questions correctly -> reach the snowy summit and win.
 *
 * How answer checking works
 * - Each question has one correct choice.
 * - The safer / riskier answers are shuffled once per question for each run, so
 *   the safer answer is not always on the same side.
 * - We compare the clicked choice id against the `isCorrect` flag in the data.
 * - Correct answers advance progress.
 * - Wrong answers end the attempt immediately.
 *
 * How animations are triggered
 * - The visual scene is driven by `characterStage` and `phase`.
 * - We schedule short timeouts for climb / fall transitions.
 * - When the animation completes, we switch to the next question or end screen.
 *
 * How LMS completion reporting works
 * - On win OR loss, we send:
 *   `window.parent.postMessage({ type: "MODULE_COMPLETE", moduleId, score, success, questionsAnswered, totalQuestions, timeSeconds }, "*")`
 * - If `embed=true`, this auto-posts once.
 * - We also expose a fallback "Save Result" button that uses `/api/attempts`.
 *
 * How keyboard input is handled
 * - Left option: `A` or Left Arrow
 * - Right option: `D` or Right Arrow
 * - Keyboard input is only active during the question phase.
 * - During climb / fall animations, input is ignored so players cannot double-submit.
 *
 * How the layout avoids blocking the game scene
 * - The main mountain scene stays large and visible in the top section.
 * - The mission HUD is kept thin at the very top like a lightweight game overlay.
 * - The decision interface now lives in its own connected panel below the scene.
 * - This separation keeps the climb readable while still making the choices feel
 *   like direct controls for the mountain run above.
 *
 * How this sizing pass works
 * - The outer module stays large so the climb still feels immersive.
 * - The inner cards, summary boxes, and decision panels are tightened so they
 *   support the gameplay instead of competing with it.
 *
 * How to edit the module later
 * - Change question content in `src/lib/cyberHillQuestions.ts`
 * - Change scoring logic in `src/lib/cyberHillGameLogic.ts`
 * - Change the look of the mountain in `src/components/CyberHillScene.tsx`
 */

type GamePhase =
  | "start"
  | "question"
  | "climbing"
  | "falling"
  | "gameover"
  | "victory";

type CompletionPayload = {
  type: "MODULE_COMPLETE";
  moduleId: string;
  score: number;
  success: boolean;
  questionsAnswered: number;
  totalQuestions: number;
  timeSeconds: number;
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createRunSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

export function CyberHillClimberGame(props: {
  moduleId: string;
  embed: boolean;
  userId?: string;
  questions: CyberHillQuestion[];
}) {
  const totalQuestions = props.questions.length;

  const [phase, setPhase] = useState<GamePhase>("start");
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [characterStage, setCharacterStage] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [pressedChoiceId, setPressedChoiceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    "Choose the safer cybersecurity decision to climb higher."
  );
  const [runSeed, setRunSeed] = useState(() => createRunSeed());

  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error" | "unauthorized"
  >("idle");

  const timeoutIdsRef = useRef<number[]>([]);
  const postedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    /**
     * Root cause of the freeze (plain English)
     * - In React's development mode, effects can mount, clean up, and mount again.
     * - The earlier version only set `mountedRef` to `false` in cleanup.
     * - That left the ref stuck as `false` after React's dev remount cycle.
     * - Our climb timeout then thought the component was already unmounted, so the
     *   callback that should reveal the next question never ran.
     *
     * Fix
     * - Explicitly set the ref back to `true` each time the component mounts.
     * - Now stage progression callbacks are allowed to complete normally.
     */
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of timeoutIdsRef.current) window.clearTimeout(id);
      timeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!startedAtMs) return;
    if (endedAtMs) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [endedAtMs, startedAtMs]);

  const timeSeconds =
    startedAtMs == null
      ? 0
      : Math.max(0, Math.floor(((endedAtMs ?? Date.now()) - startedAtMs) / 1000));

  const success = phase === "victory";
  const completed = phase === "victory" || phase === "gameover";
  // Question state is driven by `questionsAnswered`.
  // Example:
  // - 0 correct answers => question 1
  // - 1 correct answer  => question 2
  // - etc.
  const currentQuestion = props.questions[questionsAnswered] ?? null;
  const displayedChoices = useMemo(
    () => (currentQuestion ? getPresentedChoices(currentQuestion, runSeed) : null),
    [currentQuestion, runSeed]
  );
  const currentPhaseForScene: CyberHillScenePhase = phase;
  const score = useMemo(
    () =>
      computeCyberHillScore({
        questionsAnswered,
        totalQuestions,
        success
      }),
    [questionsAnswered, success, totalQuestions]
  );

  const stageLabel = formatStageLabel({
    questionsAnswered,
    totalQuestions,
    completed
  });

  const registerTimeout = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((value) => value !== id);
      callback();
    }, ms);
    timeoutIdsRef.current.push(id);
  }, []);

  const clearScheduledTimeouts = useCallback(() => {
    for (const id of timeoutIdsRef.current) {
      window.clearTimeout(id);
    }
    timeoutIdsRef.current = [];
  }, []);

  function startRun() {
    clearScheduledTimeouts();
    setPhase("question");
    setQuestionsAnswered(0);
    setCharacterStage(0);
    setRunSeed(createRunSeed());
    setSelectedChoiceId(null);
    setPressedChoiceId(null);
    setFeedback(null);
    setStatus("Choose the safer answer to begin climbing.");
    setSaveState("idle");
    postedRef.current = false;
    setStartedAtMs(Date.now());
    setEndedAtMs(null);
  }

  function resetToStartScreen() {
    clearScheduledTimeouts();
    setPhase("start");
    setQuestionsAnswered(0);
    setCharacterStage(0);
    setSelectedChoiceId(null);
    setPressedChoiceId(null);
    setFeedback(null);
    setStatus("Choose the safer cybersecurity decision to climb higher.");
    setSaveState("idle");
    postedRef.current = false;
    setStartedAtMs(null);
    setEndedAtMs(null);
  }

  useEffect(() => {
    if (!completed) return;
    if (!endedAtMs) setEndedAtMs(Date.now());

    if (!props.embed || postedRef.current) return;
    postedRef.current = true;

    const payload: CompletionPayload = {
      type: "MODULE_COMPLETE",
      moduleId: props.moduleId,
      score,
      success,
      questionsAnswered,
      totalQuestions,
      timeSeconds
    };

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        setStatus(success ? "Summit reached. Result sent to the LMS." : "Run ended. Result sent to the LMS.");
      }
    } catch {
      setStatus("Run finished. (Could not message the parent LMS. You can still save the result.)");
    }
  }, [completed, endedAtMs, props.embed, props.moduleId, questionsAnswered, score, success, timeSeconds, totalQuestions]);

  async function saveResult() {
    if (!completed) {
      setStatus("Finish the climb first, then save your result.");
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
          moduleId: props.moduleId,
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

  const chooseAnswer = useCallback((choiceId: string) => {
    if (phase !== "question" || !currentQuestion || selectedChoiceId) return;

    const correctChoice = getCorrectChoice(currentQuestion);
    const pickedChoice = (displayedChoices ?? currentQuestion.choices).find(
      (choice) => choice.id === choiceId
    );
    if (!pickedChoice) return;

    setSelectedChoiceId(choiceId);
    setPressedChoiceId(null);

    if (pickedChoice.isCorrect) {
      const nextAnswered = questionsAnswered + 1;
      setFeedback(`Correct: ${currentQuestion.successExplanation}`);
      setStatus("Nice call. Climbing higher...");
      setPhase("climbing");
      setCharacterStage(nextAnswered);
      setQuestionsAnswered(nextAnswered);

      // Stage progression after a correct answer:
      // 1) update the climber stage immediately so the animation starts
      // 2) wait briefly for the climb motion to finish
      // 3) switch back to `question`, which reveals the *next* question because
      //    `questionsAnswered` already advanced above
      registerTimeout(() => {
        if (!mountedRef.current) return;
        setSelectedChoiceId(null);
        setPressedChoiceId(null);
        setFeedback(null);

        if (nextAnswered >= totalQuestions) {
          setPhase("victory");
          setEndedAtMs(Date.now());
          setStatus("You made secure decisions all the way to the summit.");
          return;
        }

        setPhase("question");
        setStatus("Good choice. Here comes the next cybersecurity decision.");
      }, 900);

      return;
    }

    setFeedback(`Safer answer: ${correctChoice.label}. ${currentQuestion.failureExplanation}`);
    setStatus("That choice was risky. The climber slipped.");
    setPhase("falling");

    registerTimeout(() => {
      if (!mountedRef.current) return;
      setCharacterStage(0);
    }, 220);

    registerTimeout(() => {
      if (!mountedRef.current) return;
      setSelectedChoiceId(null);
      setPressedChoiceId(null);
      setPhase("gameover");
      setEndedAtMs(Date.now());
      setStatus("The climb ended early. Review the safer choice and try again.");
    }, 1100);
  }, [
    currentQuestion,
    displayedChoices,
    phase,
    questionsAnswered,
    registerTimeout,
    selectedChoiceId,
    totalQuestions
  ]);

  useEffect(() => {
    /**
     * How answer randomization + keyboard controls work together
     * - `displayedChoices[0]` is the left bubble on screen.
     * - `displayedChoices[1]` is the right bubble on screen.
     * - We shuffle them once per question per run, then reuse that order for
     *   clicks and keyboard presses so the UI never flickers out of sync.
     */
    if (phase !== "question" || !displayedChoices || selectedChoiceId) return;
    const activeChoices = displayedChoices;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      const wantsLeft = event.code === "KeyA" || event.key === "ArrowLeft";
      const wantsRight = event.code === "KeyD" || event.key === "ArrowRight";
      if (!wantsLeft && !wantsRight) return;

      event.preventDefault();
      const choice = wantsLeft ? activeChoices[0] : activeChoices[1];
      if (!choice) return;

      setPressedChoiceId(choice.id);
      registerTimeout(() => {
        if (!mountedRef.current) return;
        setPressedChoiceId((current) => (current === choice.id ? null : current));
      }, 140);
      chooseAnswer(choice.id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chooseAnswer, displayedChoices, phase, registerTimeout, selectedChoiceId]);

  function renderDecisionPanel() {
    if (phase === "start") {
      return (
        <div className="pointer-events-auto rounded-[1.45rem] border border-white/60 bg-white/72 p-4 shadow-inner backdrop-blur-md">
          <div className="space-y-3 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-fg">
                Ready to climb?
              </p>
              <h2 className="mt-1 text-xl font-semibold">Start your climb</h2>
              <p className="mt-1.5 text-sm text-muted-fg">
                You will face {totalQuestions} quick cybersecurity decisions. Pick the safer answer each time to reach the summit.
              </p>
            </div>

            <div className="flex justify-center">
              <Button type="button" onClick={startRun}>
                Start Climb
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === "question" && currentQuestion) {
      return (
        <div className="pointer-events-auto space-y-2.5">
          <div className="rounded-[1.3rem] border border-white/55 bg-white/60 px-3.5 py-3 shadow-sm backdrop-blur-md md:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-fg">
              {stageLabel}
            </p>
            <h2 className="mt-1 text-[15px] font-semibold leading-tight text-fg md:text-base">
              {currentQuestion.prompt}
            </h2>
            <p className="mt-1.5 text-[11px] text-muted-fg">
              Press <span className="font-semibold text-fg">A</span> / <span className="font-semibold text-fg">←</span> for the left option,{" "}
              <span className="font-semibold text-fg">D</span> / <span className="font-semibold text-fg">→</span> for the right option.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(displayedChoices ?? currentQuestion.choices).map((choice, index) => {
              const selected = selectedChoiceId === choice.id;
              const pressed = pressedChoiceId === choice.id;
              const isLeft = index === 0;

              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => chooseAnswer(choice.id)}
                  className={[
                    "group relative rounded-[1.35rem] border bg-white/68 px-3.5 py-3 text-left shadow-md backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                    selected
                      ? "border-accent/55 bg-accent/10 shadow-lg"
                      : "border-white/65 hover:border-accent/35",
                    pressed ? "scale-[1.02] ring-2 ring-accent/25" : ""
                  ].join(" ")}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={[
                        "mt-0.5 flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors duration-200",
                        selected || pressed
                          ? "border-accent/45 bg-accent/10 text-accent"
                          : "border-border/70 bg-white/70 text-muted-fg group-hover:border-accent/35"
                      ].join(" ")}
                    >
                      {isLeft ? "L" : "R"}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[13px] font-medium leading-snug text-fg md:text-sm">{choice.label}</p>
                      <p className="text-[11px] text-muted-fg">
                        {isLeft ? "Left path option" : "Right path option"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (phase === "climbing") {
      return (
        <div className="pointer-events-none rounded-[1.3rem] border border-emerald-200/80 bg-white/68 p-3 text-center shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">
            Move locked in
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">Climbing higher...</h2>
          <p className="mt-0.5 text-[13px] text-fg">{feedback}</p>
        </div>
      );
    }

    if (phase === "falling") {
      return (
        <div className="pointer-events-none rounded-[1.3rem] border border-rose-200/80 bg-white/68 p-3 text-center shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700/80">
            Risky move
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">Slip!</h2>
          <p className="mt-0.5 text-[13px] text-fg">{feedback}</p>
        </div>
      );
    }

    if (phase === "gameover") {
      return (
        <div className="pointer-events-auto rounded-[1.45rem] border border-white/65 bg-white/78 p-4 shadow-inner backdrop-blur-md">
          <div className="space-y-3 text-center">
            <div>
              <h2 className="text-xl font-semibold">Game over</h2>
              <p className="mt-1.5 text-sm text-muted-fg">
                You answered {questionsAnswered} of {totalQuestions} questions safely before slipping.
              </p>
              {feedback ? <p className="mt-2 text-sm text-fg">{feedback}</p> : null}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={startRun}>
                Restart Climb
              </Button>
              <Button type="button" variant="secondary" onClick={resetToStartScreen}>
                Back to Start
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === "victory") {
      return (
        <div className="pointer-events-auto rounded-[1.45rem] border border-white/65 bg-white/78 p-4 shadow-inner backdrop-blur-md">
          <div className="space-y-3 text-center">
            <div>
              <h2 className="text-xl font-semibold">Summit reached</h2>
              <p className="mt-1.5 text-sm text-muted-fg">
                Congratulations — you made secure decisions all the way to the top.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={startRun}>
                Play Again
              </Button>
              <Button type="button" variant="secondary" onClick={resetToStartScreen}>
                Back to Start
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <main data-embed-page className="mx-auto w-full max-w-[56rem] px-4 py-5">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_240px]">
        <section className="space-y-4">
          <Card className="overflow-hidden border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,247,250,0.95))] p-3.5">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-fg">
                  Cyber Hill Climber
                </p>
                <h1 className="mt-1 font-serif text-xl font-semibold tracking-tight text-fg md:text-[1.7rem]">
                  Climb by making safer decisions
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-fg">
                  A self-contained decision game where every safer cybersecurity choice helps your climber reach the snowy peak.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card/80 px-3 py-2 text-[13px]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-fg">Run Summary</p>
                <p className="mt-0.5 font-semibold text-fg">
                  {questionsAnswered} / {totalQuestions} checkpoints cleared
                </p>
              </div>
            </div>
          </Card>

          <div className="relative">
            <CyberHillScene
              stageIndex={characterStage}
              totalStages={totalQuestions}
              phase={currentPhaseForScene}
              stageLabel={stageLabel}
              instructions="Choose the safer cybersecurity option to keep climbing."
              score={score}
              timeLabel={formatTime(timeSeconds)}
              status={status}
            />

            <div className="relative z-10 -mt-4 px-2 pb-1 md:-mt-5 md:px-4">
              <div className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] shadow-[0_18px_35px_rgba(15,23,42,0.08)]">
                <div className="h-px bg-[linear-gradient(90deg,rgba(15,23,42,0.02),rgba(59,130,246,0.22),rgba(245,158,11,0.2),rgba(15,23,42,0.02))]" />
                <div className="px-3.5 py-3.5 md:px-4 md:py-4">
                  {renderDecisionPanel()}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Progress</h2>
            <div className="mt-2.5 space-y-2.5 text-sm text-muted-fg">
              <p>
                Current progress:{" "}
                <span className="font-medium text-fg">
                  {questionsAnswered} of {totalQuestions}
                </span>
              </p>
              <p>
                Current score: <span className="font-medium text-fg">{score}</span>
              </p>
              <p>
                Run state: <span className="font-medium text-fg capitalize">{phase}</span>
              </p>
              <p>Correct answers move you to the next ledge. One risky answer ends the run.</p>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Save result</h2>
            <p className="mt-1.5 text-sm text-muted-fg">
              When the run ends, this button saves your score using the same attempts API as the other native LMS modules.
            </p>

            <div className="mt-3 space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => void saveResult()}
                disabled={!completed || saveState === "saving" || saveState === "saved"}
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

              <p className="text-xs text-muted-fg">
                Completion payload:{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  {
                    "{ type: \"MODULE_COMPLETE\", moduleId, score, success, questionsAnswered, totalQuestions, timeSeconds }"
                  }
                </code>
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}
