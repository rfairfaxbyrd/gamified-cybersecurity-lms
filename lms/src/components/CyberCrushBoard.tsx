"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import type { CyberCrushBoard as CyberCrushBoardState, CyberCrushCell } from "@/lib/cyberCrushEngine";
import type { CyberCrushTilePresentation } from "@/lib/cyberCrushLevelData";

/**
 * What this file does
 * - Renders the visual Cyber Crush board.
 * - It does NOT decide the game rules; it only displays the current board state and
 *   tells the parent which tile the user clicked.
 *
 * How the animated board works
 * - Each tile has a stable `id`.
 * - We place tiles using absolute positioning inside a square board.
 * - When the same tile `id` moves to a new row/column, CSS transitions animate it.
 * - This gives us smooth swaps, falling tiles, and refills without a heavy animation library.
 *
 * How icon assets are loaded from the content folder
 * - The parent passes each tile's `iconUrl` if a real file exists in `/content`.
 * - If the image fails or is missing, this board falls back to a labeled colored tile.
 */

function cellKey(cell: CyberCrushCell) {
  return `${cell.row},${cell.col}`;
}

function TileFace({
  presentation,
  isMatched
}: {
  presentation: CyberCrushTilePresentation;
  isMatched: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(presentation.iconUrl) && !imageFailed;

  return (
    <div
      className={[
        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/35 shadow-sm transition-all duration-200",
        isMatched ? "scale-75 opacity-0" : "scale-100 opacity-100"
      ].join(" ")}
      style={
        {
          backgroundImage: presentation.fallbackGradient
        } satisfies CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.28),_transparent_60%)]" />
      {showImage ? (
        <Image
          src={presentation.iconUrl!}
          alt={presentation.label}
          fill
          unoptimized
          sizes="(max-width: 768px) 12vw, 72px"
          className="relative z-10 object-contain p-[14%] drop-shadow-[0_6px_14px_rgba(0,0,0,0.18)]"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-2 text-center text-white">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/75">
            Cyber
          </span>
          <span className="mt-1 text-sm font-semibold uppercase tracking-[0.08em]">
            {presentation.shortLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export function CyberCrushBoard(props: {
  board: CyberCrushBoardState;
  tiles: CyberCrushTilePresentation[];
  selectedCell: CyberCrushCell | null;
  matchedCells: CyberCrushCell[];
  disabled?: boolean;
  onTileClick: (cell: CyberCrushCell) => void;
}) {
  const rows = props.board.length;
  const cols = props.board[0]?.length ?? 0;

  const tileByKind = useMemo(
    () => new Map(props.tiles.map((tile) => [tile.kind, tile])),
    [props.tiles]
  );

  const matchedKeys = useMemo(
    () => new Set(props.matchedCells.map(cellKey)),
    [props.matchedCells]
  );

  const flattened = useMemo(() => {
    const items: Array<{
      tile: { id: string; kind: string };
      row: number;
      col: number;
      presentation: CyberCrushTilePresentation;
    }> = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const tile = props.board[row]?.[col];
        if (!tile) continue;
        const presentation = tileByKind.get(tile.kind);
        if (!presentation) continue;

        items.push({ tile, row, col, presentation });
      }
    }

    return items;
  }, [cols, props.board, rows, tileByKind]);

  return (
    <div className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,247,250,0.92))] p-3 shadow-[0_22px_48px_rgba(15,23,42,0.10)]">
      <div className="relative mx-auto aspect-square w-full max-w-[380px] rounded-[1.35rem] border border-border/70 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.88),_rgba(226,232,240,0.82))] p-1 shadow-inner">
        <div className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-[linear-gradient(135deg,rgba(128,128,128,0.06),transparent_45%,rgba(91,33,182,0.04))]" />
        {flattened.map(({ tile, row, col, presentation }) => {
          const isSelected =
            props.selectedCell?.row === row && props.selectedCell?.col === col;
          const isMatched = matchedKeys.has(cellKey({ row, col }));

          return (
            <button
              key={tile.id}
              type="button"
              disabled={props.disabled}
              onClick={() => props.onTileClick({ row, col })}
              aria-label={`${presentation.label} tile at row ${row + 1}, column ${col + 1}`}
              className={[
                "absolute block p-[4px] transition-[left,top] duration-250 ease-out",
                props.disabled ? "cursor-default" : "cursor-pointer"
              ].join(" ")}
              style={
                {
                  left: `calc((100% / ${cols}) * ${col})`,
                  top: `calc((100% / ${rows}) * ${row})`,
                  width: `calc(100% / ${cols})`,
                  height: `calc(100% / ${rows})`
                } satisfies CSSProperties
              }
            >
              <div
                className={[
                  "h-full w-full rounded-2xl transition-all duration-150",
                  isSelected ? "scale-[1.04] ring-4 ring-accent/20" : "",
                  !props.disabled ? "hover:scale-[1.02]" : ""
                ].join(" ")}
              >
                <TileFace presentation={presentation} isMatched={isMatched} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
