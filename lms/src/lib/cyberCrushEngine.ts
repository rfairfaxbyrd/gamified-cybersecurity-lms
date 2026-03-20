/**
 * What this file does
 * - Implements the *pure match-3 rules* for Cyber Crush.
 * - This file knows nothing about React, buttons, or the LMS UI.
 * - It only knows how the board behaves:
 *   - how tiles are created
 *   - how swaps are validated
 *   - how matches are found
 *   - how cascades/refills work
 *
 * Why this separation matters
 * - Keeping the engine "pure" makes it much safer to add Cyber Crush without
 *   accidentally breaking other LMS modules.
 * - The UI can animate and render however it wants, while the engine stays small
 *   and predictable.
 *
 * How the match-3 engine works
 * 1) Build a board that starts with NO automatic matches already on it.
 * 2) When the player swaps two adjacent tiles:
 *    - if the swap creates a match, keep it
 *    - if not, it is an invalid move and should swap back
 * 3) Find all horizontal/vertical runs of 3 or more matching tiles.
 * 4) Clear those matched tiles.
 * 5) Collapse each column downward.
 * 6) Refill the empty spaces with new random tiles from the top.
 * 7) Repeat until the board becomes stable (no more matches).
 *
 * How to change board size or tile kinds later
 * - Update the caller inputs (`rows`, `cols`, `tileKinds`) without changing the
 *   core algorithms below.
 */

export type CyberCrushCell = {
  row: number;
  col: number;
};

export type CyberCrushTile = {
  id: string;
  kind: string;
};

export type CyberCrushBoard = Array<Array<CyberCrushTile | null>>;

export type CyberCrushMatchGroup = {
  direction: "horizontal" | "vertical";
  kind: string;
  cells: CyberCrushCell[];
};

export type CyberCrushCascadeStep = {
  matchGroups: CyberCrushMatchGroup[];
  matchedCells: CyberCrushCell[];
  boardAfterClear: CyberCrushBoard;
  boardAfterCollapse: CyberCrushBoard;
  clearedCount: number;
};

export function cloneBoard(board: CyberCrushBoard): CyberCrushBoard {
  return board.map((row) => [...row]);
}

export function createSeededRandom(seed: number) {
  // Simple deterministic RNG (good enough for a game board).
  let state = (seed >>> 0) || 1;
  return function nextRandom() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function keyForCell(cell: CyberCrushCell) {
  return `${cell.row},${cell.col}`;
}

function pickRandomKind(tileKinds: string[], random: () => number) {
  const index = Math.floor(random() * tileKinds.length);
  return tileKinds[index] ?? tileKinds[0] ?? "";
}

export function areAdjacent(a: CyberCrushCell, b: CyberCrushCell) {
  const rowDistance = Math.abs(a.row - b.row);
  const colDistance = Math.abs(a.col - b.col);
  return rowDistance + colDistance === 1;
}

function wouldCreateImmediateMatch(
  board: CyberCrushBoard,
  row: number,
  col: number,
  kind: string
) {
  // We only need to check left/up while building the initial board.
  const left1 = col - 1 >= 0 ? board[row]?.[col - 1] : null;
  const left2 = col - 2 >= 0 ? board[row]?.[col - 2] : null;
  if (left1?.kind === kind && left2?.kind === kind) return true;

  const up1 = row - 1 >= 0 ? board[row - 1]?.[col] : null;
  const up2 = row - 2 >= 0 ? board[row - 2]?.[col] : null;
  if (up1?.kind === kind && up2?.kind === kind) return true;

  return false;
}

function wouldCreateSpawnMatch(
  board: CyberCrushBoard,
  row: number,
  col: number,
  kind: string
) {
  /**
   * Why this helper exists
   * - During cascade refills, the original version simply dropped in random tiles.
   * - That could accidentally create brand-new automatic matches over and over,
   *   which made the UI look like it was "stuck loading" after one move.
   * - Here we keep refill randomness, but avoid *introducing* immediate matches
   *   from freshly spawned tiles.
   *
   * How it works
   * - Refill builds the next board from left-to-right and bottom-to-top.
   * - That means the cells to the left and below are already known.
   * - If choosing this `kind` would instantly create 3-in-a-row with those
   *   already-built neighbors, we reject that option and try another kind.
   *
   * What this does NOT block
   * - Legitimate cascades caused by existing tiles falling into place.
   * - So the game still feels like match-3, just without runaway refill loops.
   */
  const left1 = col - 1 >= 0 ? board[row]?.[col - 1] : null;
  const left2 = col - 2 >= 0 ? board[row]?.[col - 2] : null;
  if (left1?.kind === kind && left2?.kind === kind) return true;

  const down1 = row + 1 < board.length ? board[row + 1]?.[col] : null;
  const down2 = row + 2 < board.length ? board[row + 2]?.[col] : null;
  if (down1?.kind === kind && down2?.kind === kind) return true;

  return false;
}

export function swapBoardCells(
  board: CyberCrushBoard,
  a: CyberCrushCell,
  b: CyberCrushCell
) {
  const next = cloneBoard(board);
  const temp = next[a.row]?.[a.col] ?? null;
  if (!next[a.row] || !next[b.row]) return next;

  next[a.row][a.col] = next[b.row]?.[b.col] ?? null;
  next[b.row][b.col] = temp;
  return next;
}

/**
 * Finds every horizontal and vertical run of 3+ matching tiles.
 */
export function findMatchGroups(board: CyberCrushBoard): CyberCrushMatchGroup[] {
  const groups: CyberCrushMatchGroup[] = [];
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  // Horizontal scans
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      const startTile = board[row]?.[col];
      if (!startTile) {
        col += 1;
        continue;
      }

      let end = col + 1;
      while (end < cols && board[row]?.[end]?.kind === startTile.kind) {
        end += 1;
      }

      if (end - col >= 3) {
        groups.push({
          direction: "horizontal",
          kind: startTile.kind,
          cells: Array.from({ length: end - col }, (_, index) => ({
            row,
            col: col + index
          }))
        });
      }

      col = end;
    }
  }

  // Vertical scans
  for (let col = 0; col < cols; col += 1) {
    let row = 0;
    while (row < rows) {
      const startTile = board[row]?.[col];
      if (!startTile) {
        row += 1;
        continue;
      }

      let end = row + 1;
      while (end < rows && board[end]?.[col]?.kind === startTile.kind) {
        end += 1;
      }

      if (end - row >= 3) {
        groups.push({
          direction: "vertical",
          kind: startTile.kind,
          cells: Array.from({ length: end - row }, (_, index) => ({
            row: row + index,
            col
          }))
        });
      }

      row = end;
    }
  }

  return groups;
}

export function collectMatchedCells(groups: CyberCrushMatchGroup[]) {
  const byKey = new Map<string, CyberCrushCell>();

  for (const group of groups) {
    for (const cell of group.cells) {
      byKey.set(keyForCell(cell), cell);
    }
  }

  return Array.from(byKey.values());
}

export function clearMatchedCells(
  board: CyberCrushBoard,
  matchedCells: CyberCrushCell[]
) {
  const next = cloneBoard(board);

  for (const cell of matchedCells) {
    if (next[cell.row]) next[cell.row][cell.col] = null;
  }

  return next;
}

/**
 * Drops existing tiles downward and spawns new ones at the top.
 */
export function collapseAndRefillBoard(params: {
  board: CyberCrushBoard;
  rows: number;
  cols: number;
  tileKinds: string[];
  random: () => number;
  createTile: (kind: string) => CyberCrushTile;
}) {
  const { board, rows, cols, tileKinds, random, createTile } = params;
  const next: CyberCrushBoard = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  for (let col = 0; col < cols; col += 1) {
    const survivors: CyberCrushTile[] = [];

    for (let row = rows - 1; row >= 0; row -= 1) {
      const tile = board[row]?.[col] ?? null;
      if (tile) survivors.push(tile);
    }

    let writeRow = rows - 1;
    for (const tile of survivors) {
      next[writeRow]![col] = tile;
      writeRow -= 1;
    }

    while (writeRow >= 0) {
      const allowedKinds = tileKinds.filter(
        (kind) => !wouldCreateSpawnMatch(next, writeRow, col, kind)
      );
      const pool = allowedKinds.length > 0 ? allowedKinds : tileKinds;
      const kind = pickRandomKind(pool, random);
      next[writeRow]![col] = createTile(kind);
      writeRow -= 1;
    }
  }

  return next;
}

/**
 * Repeats clear -> collapse -> refill until the board becomes stable.
 */
export function resolveBoardCascades(params: {
  board: CyberCrushBoard;
  rows: number;
  cols: number;
  tileKinds: string[];
  random: () => number;
  createTile: (kind: string) => CyberCrushTile;
  maxSteps?: number;
}) {
  const { rows, cols, tileKinds, random, createTile } = params;
  const maxSteps = params.maxSteps ?? 50;

  let workingBoard = cloneBoard(params.board);
  const steps: CyberCrushCascadeStep[] = [];
  let totalCleared = 0;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const matchGroups = findMatchGroups(workingBoard);
    if (matchGroups.length === 0) break;

    const matchedCells = collectMatchedCells(matchGroups);
    const boardAfterClear = clearMatchedCells(workingBoard, matchedCells);
    const boardAfterCollapse = collapseAndRefillBoard({
      board: boardAfterClear,
      rows,
      cols,
      tileKinds,
      random,
      createTile
    });

    steps.push({
      matchGroups,
      matchedCells,
      boardAfterClear,
      boardAfterCollapse,
      clearedCount: matchedCells.length
    });

    totalCleared += matchedCells.length;
    workingBoard = boardAfterCollapse;
  }

  const didHitMaxSteps = findMatchGroups(workingBoard).length > 0;

  return {
    finalBoard: workingBoard,
    steps,
    totalCleared,
    didHitMaxSteps
  };
}

/**
 * Returns true if the board has *any* valid adjacent swap that would create a match.
 */
export function hasPlayableMove(board: CyberCrushBoard) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const current = { row, col };

      // Check right neighbor
      if (col + 1 < cols) {
        const swapped = swapBoardCells(board, current, { row, col: col + 1 });
        if (findMatchGroups(swapped).length > 0) return true;
      }

      // Check down neighbor
      if (row + 1 < rows) {
        const swapped = swapBoardCells(board, current, { row: row + 1, col });
        if (findMatchGroups(swapped).length > 0) return true;
      }
    }
  }

  return false;
}

/**
 * Creates a board with:
 * - no automatic matches already present
 * - at least one valid move available
 */
export function createInitialPlayableBoard(params: {
  rows: number;
  cols: number;
  tileKinds: string[];
  random: () => number;
  createTile: (kind: string) => CyberCrushTile;
  maxAttempts?: number;
}) {
  const { rows, cols, tileKinds, random, createTile } = params;
  const maxAttempts = params.maxAttempts ?? 200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const board: CyberCrushBoard = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => null)
    );

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const allowedKinds = tileKinds.filter(
          (kind) => !wouldCreateImmediateMatch(board, row, col, kind)
        );
        const pool = allowedKinds.length > 0 ? allowedKinds : tileKinds;
        const kind = pickRandomKind(pool, random);
        board[row]![col] = createTile(kind);
      }
    }

    if (hasPlayableMove(board)) return board;
  }

  throw new Error(
    "Could not create a playable Cyber Crush board. Try increasing tile variety or maxAttempts."
  );
}
