"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * What this file does
 * - Renders the visual mountain scene for Cyber Hill Climber.
 * - It is responsible for the simple 2D look:
 *   - sky
 *   - mountain
 *   - summit
 *   - stage markers
 *   - climber position / motion
 *
 * How animations are triggered
 * - The parent component passes the current climb stage and the current phase
 *   (question, climbing, falling, victory, etc.).
 * - The climber wrapper uses CSS transitions, so moving from one stage to the next
 *   feels smooth without a heavy game engine.
 *
 * How the game window layout is structured
 * - Top of the scene: a compact glass HUD with instructions, stage, score, and time.
 * - Middle of the scene: the mountain, ledges, markers, and climber.
 * - Bottom / center overlay: compact question bubbles, feedback, or start / game-over panels.
 *
 * How the layout was rebalanced
 * - The scene is taller now so the mountain has more breathing room.
 * - The HUD was compressed into a thinner bar and docked above the scene so it
 *   stays visually connected without covering the summit or climber.
 * - The answer controls stay low in the window to keep the climber and summit as the visual focus.
 *
 * How readability stays intact
 * - The outer game window remains large.
 * - Only the support UI (HUD boxes and spacing) is tightened so more of the
 *   mountain remains visible at once.
 *
 * How to adjust the mountain later
 * - Tweak `BASE_ANCHORS` to move the climber path.
 * - Adjust gradients / shapes below to change the visual style.
 */

export type CyberHillScenePhase =
  | "start"
  | "question"
  | "climbing"
  | "falling"
  | "gameover"
  | "victory";

type Anchor = { x: number; y: number };

const BASE_ANCHORS: Anchor[] = [
  { x: 20, y: 86 },
  { x: 28, y: 75 },
  { x: 38, y: 64 },
  { x: 48, y: 53 },
  { x: 59, y: 42 },
  { x: 69, y: 31 },
  { x: 78, y: 20 },
  { x: 85, y: 11 }
];

function buildAnchors(totalQuestions: number) {
  const needed = totalQuestions + 1;
  if (needed <= BASE_ANCHORS.length) return BASE_ANCHORS.slice(0, needed);
  return BASE_ANCHORS;
}

function characterStyle(anchor: Anchor): CSSProperties {
  return {
    left: `${anchor.x}%`,
    top: `${anchor.y}%`
  };
}

export function CyberHillScene(props: {
  stageIndex: number;
  totalStages: number;
  phase: CyberHillScenePhase;
  stageLabel: string;
  instructions: string;
  score: number;
  timeLabel: string;
  status?: string | null;
  children?: ReactNode;
}) {
  const anchors = buildAnchors(props.totalStages);
  const anchor = anchors[Math.min(props.stageIndex, anchors.length - 1)] ?? anchors[0]!;
  const summitAnchor = anchors.at(-1) ?? anchor;

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-[linear-gradient(180deg,rgba(241,245,249,0.98),rgba(226,232,240,0.92))] p-3 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
      <div className="relative z-10 pb-2.5">
        <div className="rounded-[1.15rem] border border-white/55 bg-white/46 px-3 py-2 shadow-md backdrop-blur-lg">
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-fg">
                Mission
              </p>
              <p className="mt-0.5 text-[13px] text-fg">{props.instructions}</p>
            </div>

            <div className="grid gap-1.5 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-border/50 bg-white/56 px-2.5 py-1.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-fg">Stage</p>
                <p className="mt-0.5 text-[13px] font-semibold text-fg">{props.stageLabel}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-white/56 px-2.5 py-1.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-fg">Score</p>
                <p className="mt-0.5 text-[13px] font-semibold text-fg">{props.score}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-white/56 px-2.5 py-1.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-fg">Time</p>
                <p className="mt-0.5 text-[13px] font-semibold text-fg">{props.timeLabel}</p>
              </div>
            </div>
          </div>

          {props.status ? (
            <div className="mt-1.5 rounded-2xl border border-border/45 bg-white/42 px-2.5 py-1.5 text-[13px] text-fg">
              {props.status}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative h-[360px] overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,#cfe6ff_0%,#e9f3ff_34%,#f8fafc_100%)] md:h-[430px] xl:h-[480px]">
        <div className="absolute left-10 top-12 h-20 w-20 rounded-full bg-white/60 blur-2xl" />
        <div className="absolute right-14 top-16 h-24 w-24 rounded-full bg-white/55 blur-2xl" />
        <div className="absolute left-[18%] top-[16%] h-14 w-32 rounded-full bg-white/40 blur-2xl" />
        <div className="absolute right-[12%] top-[22%] h-16 w-36 rounded-full bg-white/35 blur-2xl" />

        <div className="absolute inset-x-0 bottom-[34%] h-[24%] bg-[linear-gradient(180deg,rgba(71,85,105,0.12),rgba(51,65,85,0.05))] [clip-path:polygon(0_100%,0_82%,15%_60%,30%_73%,45%_48%,60%_63%,76%_34%,100%_61%,100%_100%)]" />

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 100 L0 92 L8 85 L18 82 L28 74 L40 64 L52 53 L64 41 L77 27 L89 14 L100 8 L100 100 Z"
            fill="url(#cyber-hill-main)"
          />
          <path
            d="M0 100 L0 96 L13 88 L26 86 L38 76 L51 67 L64 54 L76 38 L88 22 L100 14 L100 100 Z"
            fill="url(#cyber-hill-shadow)"
            opacity="0.65"
          />
          <path
            d="M72 30 L89 14 L100 8 L100 23 L89 22 L80 26 Z"
            fill="url(#cyber-hill-snow)"
          />
          <polyline
            points={anchors.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.2"
            strokeDasharray="1.2 2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="cyber-hill-main" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="52%" stopColor="#c2410c" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>
            <linearGradient id="cyber-hill-shadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c2d12" />
              <stop offset="100%" stopColor="#431407" />
            </linearGradient>
            <linearGradient id="cyber-hill-snow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#dbeafe" />
            </linearGradient>
          </defs>
        </svg>

        {anchors.slice(0, -1).map((point, index) => {
          const reached = index < props.stageIndex;
          const ledgeWidth = 112 + (index % 3) * 12;
          return (
            <div
              key={`ledge-${point.x}-${point.y}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${point.x}%`, top: `${point.y + 3.2}%` }}
            >
              <div
                className={[
                  "rounded-full border px-5 py-2 shadow-md backdrop-blur-sm transition-colors duration-300",
                  reached
                    ? "border-accent/30 bg-white/88"
                    : "border-white/70 bg-white/72"
                ].join(" ")}
                style={{ width: `${ledgeWidth}px` }}
              />
            </div>
          );
        })}

        {anchors.map((point, index) => {
          const reached = index <= props.stageIndex;
          return (
            <div
              key={`${point.x}-${point.y}`}
              className={[
                "absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-colors duration-300",
                reached
                  ? "border-accent bg-accent/90"
                  : "border-white/85 bg-white/85",
                index === anchors.length - 1 ? "ring-4 ring-white/55" : ""
              ].join(" ")}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          );
        })}

        <div
          className={[
            "absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[left,top,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
            props.phase === "climbing" ? "-rotate-6 scale-105" : "",
            props.phase === "falling" ? "translate-y-4 rotate-12 opacity-95" : "",
            props.phase === "victory" ? "scale-110 drop-shadow-[0_8px_16px_rgba(250,204,21,0.35)]" : ""
          ].join(" ")}
          style={characterStyle(anchor)}
        >
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45 blur-xl" />
          <svg width="64" height="98" viewBox="0 0 58 92" aria-hidden="true" className="relative">
            <circle cx="29" cy="12" r="8" fill="#0f172a" />
            <path d="M29 21 L29 48" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
            <path d="M29 29 L17 40" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
            <path d="M29 29 L41 35" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
            <path d="M29 48 L18 71" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
            <path d="M29 48 L41 69" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>

        <div
          className="absolute rounded-full border border-white/80 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-fg shadow-sm"
          style={{ left: `${Math.max(14, summitAnchor.x - 4)}%`, top: `${Math.max(4, summitAnchor.y - 5)}%` }}
        >
          Snowy summit
        </div>

        {props.children ? (
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end px-4 pb-4 pt-24 md:px-6 md:pb-6 md:pt-28">
            {props.children}
          </div>
        ) : null}

        {props.phase === "victory" ? (
          <div className="absolute right-6 top-28 z-30 rounded-2xl border border-accent-2/40 bg-white/92 px-4 py-3 text-sm text-fg shadow-lg">
            Summit reached!
          </div>
        ) : null}
      </div>
    </div>
  );
}
