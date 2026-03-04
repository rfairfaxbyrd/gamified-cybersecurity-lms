/**
 * What this file does
 * - Generates a word-search puzzle grid (letters) plus the "answer key" placements.
 *
 * Why this exists (plain English)
 * - A word search is just a grid of letters.
 * - The *game* needs to know where each word was placed so we can:
 *   - validate user selections (did they actually select a placed word?)
 *   - provide hints (highlight the first letter of a remaining word)
 *   - ensure every required word appears in the puzzle
 *
 * How the puzzle generation works (high level)
 * 1) Normalize words (uppercase letters, remove non-letters).
 * 2) Start with a reasonable grid size (default 15x15).
 * 3) Place words one-by-one:
 *    - pick a random direction (horizontal/vertical/diagonal, forward/backward)
 *    - pick a random start cell that fits within the grid
 *    - check if the word can be written there:
 *      - empty cells are OK
 *      - overlaps are OK only when letters match
 * 4) If we fail to place a word, we restart with a fresh grid and try again.
 * 5) Fill all remaining empty cells with random letters.
 *
 * Determinism (important for "seeded" variants)
 * - We use a tiny deterministic RNG (seeded random).
 * - Given the same word list + variant number, the generator will produce the same puzzle.
 *
 * How to change it
 * - Change directions: edit `DIRECTIONS`.
 * - Change default grid size: edit `DEFAULT_BASE_SIZE`.
 * - Make generation easier/harder: tune `MAX_LAYOUT_ATTEMPTS` and `MAX_WORD_ATTEMPTS`.
 */

export type WordSearchCell = { row: number; col: number };

export type WordSearchDirection = {
  name:
    | "E"
    | "W"
    | "S"
    | "N"
    | "SE"
    | "NW"
    | "SW"
    | "NE";
  dr: number;
  dc: number;
};

export type WordSearchPlacement = {
  /**
   * Human-friendly word shown in the UI (e.g. "Passphrase").
   */
  display: string;
  /**
   * Normalized word used for placement/validation (e.g. "PASSPHRASE").
   */
  normalized: string;
  direction: WordSearchDirection;
  cells: WordSearchCell[];
};

export type WordSearchWord = {
  key: string;
  display: string;
  normalized: string;
};

export type WordSearchPuzzle = {
  variant: number;
  width: number;
  height: number;
  grid: string[][];
  words: WordSearchWord[];
  /**
   * Placements indexed by word key (we use normalized word as the key).
   */
  placements: Record<string, WordSearchPlacement>;
};

const DEFAULT_BASE_SIZE = 15;
const MAX_SIZE = 20;
const MAX_LAYOUT_ATTEMPTS = 60;
const MAX_WORD_ATTEMPTS = 300;

const DIRECTIONS: WordSearchDirection[] = [
  // Horizontal (left→right and right→left)
  { name: "E", dr: 0, dc: 1 },
  { name: "W", dr: 0, dc: -1 },
  // Vertical (top→bottom and bottom→top)
  { name: "S", dr: 1, dc: 0 },
  { name: "N", dr: -1, dc: 0 },
  // Diagonals (both directions)
  { name: "SE", dr: 1, dc: 1 },
  { name: "NW", dr: -1, dc: -1 },
  { name: "SW", dr: 1, dc: -1 },
  { name: "NE", dr: -1, dc: 1 }
];

/**
 * Tiny 32-bit hash (FNV-1a) to turn strings into a stable numeric seed.
 * - Not cryptographically secure (we only need repeatability).
 */
function hashToUint32(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime (mod 2^32).
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Deterministic RNG: mulberry32
 * - Small, fast, good enough for game layouts.
 * - Returns a float in [0, 1).
 */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, minInclusive: number, maxInclusive: number) {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

function normalizeWord(word: string) {
  // Keep only A–Z letters and uppercase them.
  return word.replaceAll(/[^a-zA-Z]/g, "").toUpperCase();
}

function emptyGrid(width: number, height: number) {
  return Array.from({ length: height }, () => Array.from<string | null>({ length: width }).fill(null));
}

function fillRandomLetters(grid: Array<Array<string | null>>, rng: () => number) {
  const A = "A".charCodeAt(0);
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] != null) continue;
      const letter = String.fromCharCode(A + randInt(rng, 0, 25));
      grid[r][c] = letter;
    }
  }
}

function canPlaceWord(params: {
  grid: Array<Array<string | null>>;
  word: string;
  startRow: number;
  startCol: number;
  dir: WordSearchDirection;
}) {
  const { grid, word, startRow, startCol, dir } = params;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  for (let i = 0; i < word.length; i += 1) {
    const r = startRow + dir.dr * i;
    const c = startCol + dir.dc * i;
    if (r < 0 || r >= height || c < 0 || c >= width) return false;

    const existing = grid[r][c];
    const nextLetter = word[i];

    // Overlaps are allowed ONLY when the letter matches.
    if (existing != null && existing !== nextLetter) return false;
  }

  return true;
}

function placeWord(params: {
  grid: Array<Array<string | null>>;
  word: string;
  startRow: number;
  startCol: number;
  dir: WordSearchDirection;
}) {
  const { grid, word, startRow, startCol, dir } = params;
  const cells: WordSearchCell[] = [];

  for (let i = 0; i < word.length; i += 1) {
    const r = startRow + dir.dr * i;
    const c = startCol + dir.dc * i;
    grid[r][c] = word[i];
    cells.push({ row: r, col: c });
  }

  return cells;
}

function placeAllWords(params: {
  width: number;
  height: number;
  words: WordSearchWord[];
  rng: () => number;
}) {
  const { width, height, words, rng } = params;

  const grid = emptyGrid(width, height);
  const placements: Record<string, WordSearchPlacement> = {};

  // Longer words are harder to place. Placing them first reduces failure rate.
  const placeOrder = [...words].sort((a, b) => b.normalized.length - a.normalized.length);

  for (const w of placeOrder) {
    const word = w.normalized;
    let placed = false;

    // Try a bunch of random positions/directions for this word.
    for (let attempt = 0; attempt < MAX_WORD_ATTEMPTS && !placed; attempt += 1) {
      const dir = DIRECTIONS[randInt(rng, 0, DIRECTIONS.length - 1)];

      // Compute valid start ranges that keep the whole word inside the grid.
      const rowMin = dir.dr === -1 ? word.length - 1 : 0;
      const rowMax = dir.dr === 1 ? height - word.length : height - 1;
      const colMin = dir.dc === -1 ? word.length - 1 : 0;
      const colMax = dir.dc === 1 ? width - word.length : width - 1;

      if (rowMin > rowMax || colMin > colMax) continue;

      const startRow = randInt(rng, rowMin, rowMax);
      const startCol = randInt(rng, colMin, colMax);

      if (!canPlaceWord({ grid, word, startRow, startCol, dir })) continue;

      const cells = placeWord({ grid, word, startRow, startCol, dir });
      placements[w.key] = {
        display: w.display,
        normalized: w.normalized,
        direction: dir,
        cells
      };
      placed = true;
    }

    if (!placed) return null;
  }

  // Requirement: place words in multiple directions.
  // We enforce at least one horizontal, one vertical, and one diagonal word.
  // If a layout doesn't meet this, we treat it as a "failed attempt" and retry.
  let hasHorizontal = false;
  let hasVertical = false;
  let hasDiagonal = false;
  for (const p of Object.values(placements)) {
    if (p.direction.dr === 0) hasHorizontal = true;
    else if (p.direction.dc === 0) hasVertical = true;
    else hasDiagonal = true;
  }
  if (!(hasHorizontal && hasVertical && hasDiagonal)) return null;

  // Now fill all remaining empty cells with random letters so the grid looks complete.
  fillRandomLetters(grid, rng);

  // Convert nulls away (should be none after fill).
  const finalGrid = grid.map((row) => row.map((cell) => cell ?? "A"));
  return { grid: finalGrid, placements };
}

export function generateWordSearchPuzzle(params: {
  words: string[];
  variant: number;
  baseSize?: number;
}) : WordSearchPuzzle {
  const baseSize = params.baseSize ?? DEFAULT_BASE_SIZE;
  const variant = ((params.variant % 5) + 5) % 5; // keep in 0..4

  const normalizedWords: WordSearchWord[] = params.words.map((display) => {
    const normalized = normalizeWord(display);
    return { key: normalized, display, normalized };
  });

  // Basic safety: if a word normalizes to empty, that's a configuration bug.
  const bad = normalizedWords.find((w) => w.normalized.length === 0);
  if (bad) {
    throw new Error(`Invalid word "${bad.display}" (no A–Z letters).`);
  }

  // Ensure we always have room for the longest word (plus some padding).
  const maxLen = Math.max(...normalizedWords.map((w) => w.normalized.length));
  const minSize = Math.max(baseSize, maxLen + 2);

  // Make layouts deterministic per (word list + variant).
  const seedBase = hashToUint32(`${normalizedWords.map((w) => w.normalized).join("|")}|variant:${variant}`);

  for (let size = minSize; size <= MAX_SIZE; size += 1) {
    for (let layoutAttempt = 0; layoutAttempt < MAX_LAYOUT_ATTEMPTS; layoutAttempt += 1) {
      // Change the RNG stream each attempt deterministically.
      const rng = mulberry32(hashToUint32(`${seedBase}|size:${size}|try:${layoutAttempt}`));
      const placed = placeAllWords({
        width: size,
        height: size,
        words: normalizedWords,
        rng
      });
      if (!placed) continue;

      return {
        variant,
        width: size,
        height: size,
        grid: placed.grid,
        words: normalizedWords,
        placements: placed.placements
      };
    }
  }

  throw new Error("Could not generate a valid word search puzzle. Try increasing MAX_SIZE.");
}

export function pickVariantFromSeed(seed: string | undefined, variantCount = 5) {
  if (!seed || seed.trim().length === 0) return null;

  const trimmed = seed.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asInt)) {
    const n = asInt % variantCount;
    return (n + variantCount) % variantCount;
  }

  return hashToUint32(trimmed) % variantCount;
}
