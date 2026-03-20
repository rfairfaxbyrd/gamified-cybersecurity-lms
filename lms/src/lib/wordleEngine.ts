/**
 * What this file does
 * - Implements the *pure logic* for a Wordle-style game:
 *   - validate a guess
 *   - score each letter (green/yellow/gray)
 *   - handle tricky repeated-letter cases correctly
 *   - compute an MVP score (0–100)
 *   - optionally pick a deterministic solution word from a `seed`
 *
 * Key concepts (plain English)
 * - A Wordle board is 6 guesses x 5 letters.
 * - After each guess, every tile gets feedback:
 *   - "correct" = right letter, right spot (green)
 *   - "present" = letter is in the solution but in a different spot (yellow)
 *   - "absent"  = letter is not in the solution (gray)
 *
 * How Wordle checking works (including repeated letters)
 * - The "repeated letters" rule is where people often get it wrong.
 * - Example: solution = "spams" and guess = "sssss"
 *   - The solution has TWO "s" letters (s _ _ _ s).
 *   - So only TWO of the guessed "s" letters should be marked as present/correct.
 *
 * The standard algorithm:
 * 1) Mark exact matches (greens) first.
 * 2) Count the remaining letters in the solution that were NOT used by green matches.
 * 3) For each non-green guess letter:
 *    - if it exists in the remaining letter counts, mark yellow and decrement that count
 *    - otherwise mark gray
 *
 * How to change the word list / length
 * - This engine supports any fixed word length via function params,
 *   but our LMS module uses 5 letters and 6 guesses (classic Wordle).
 */

export const WORDLE_WORD_LENGTH = 5;
export const WORDLE_MAX_GUESSES = 6;

export type LetterState = "correct" | "present" | "absent";

export type EvaluatedTile = {
  letter: string;
  state: LetterState;
};

/**
 * Normalizes a word/guess:
 * - trims whitespace
 * - lowercases
 * - keeps only a–z letters (so "Phish!" becomes "phish")
 */
export function normalizeAlpha(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z]/g, "");
}

/**
 * Returns true if the guess is exactly N letters (a–z only).
 *
 * MVP note:
 * - We DO NOT check a large dictionary. Our cybersecurity Wordle has a tiny word bank,
 *   and students can learn by trying and learning the feedback.
 */
export function isValidGuess(guess: string, length = WORDLE_WORD_LENGTH) {
  const normalized = normalizeAlpha(guess);
  return normalized.length === length;
}

/**
 * Evaluates a guess against the solution and returns per-letter states.
 *
 * Inputs are treated case-insensitively, but we recommend passing normalized strings.
 */
export function evaluateGuess(params: {
  guess: string;
  solution: string;
  length?: number;
}): EvaluatedTile[] {
  const length = params.length ?? WORDLE_WORD_LENGTH;

  const guess = normalizeAlpha(params.guess).slice(0, length);
  const solution = normalizeAlpha(params.solution).slice(0, length);

  if (guess.length !== length || solution.length !== length) {
    throw new Error(`evaluateGuess requires ${length}-letter guess and solution.`);
  }

  // Step 1: mark greens and track which solution letters are "still available".
  const states: Array<LetterState | null> = Array.from({ length }, () => null);

  // Count of letters remaining in the solution after removing greens.
  const remaining = new Map<string, number>();

  for (let i = 0; i < length; i += 1) {
    const g = guess[i]!;
    const s = solution[i]!;
    if (g === s) {
      states[i] = "correct";
    } else {
      // This solution letter is not used by a green match, so it can be used for yellows.
      remaining.set(s, (remaining.get(s) ?? 0) + 1);
    }
  }

  // Step 2: mark yellows/grays for the non-green tiles.
  for (let i = 0; i < length; i += 1) {
    if (states[i]) continue; // already green
    const g = guess[i]!;
    const count = remaining.get(g) ?? 0;
    if (count > 0) {
      states[i] = "present";
      remaining.set(g, count - 1);
    } else {
      states[i] = "absent";
    }
  }

  return Array.from({ length }, (_, i) => ({
    letter: guess[i]!,
    state: states[i] as LetterState
  }));
}

/**
 * When coloring the on-screen keyboard, we want the "best" known state to win:
 * - correct > present > absent
 */
export function mergeLetterState(
  prev: LetterState | undefined,
  next: LetterState
): LetterState {
  if (prev === "correct") return "correct";
  if (next === "correct") return "correct";
  if (prev === "present") return "present";
  if (next === "present") return "present";
  return "absent";
}

/**
 * Applies an evaluation to a keyboard map (letter -> best-known state).
 */
export function applyEvaluationToKeyboard(
  keyboard: Record<string, LetterState | undefined>,
  evaluation: EvaluatedTile[]
) {
  const next = { ...keyboard };
  for (const tile of evaluation) {
    const letter = tile.letter.toLowerCase();
    if (!letter) continue;
    next[letter] = mergeLetterState(next[letter], tile.state);
  }
  return next;
}

/**
 * MVP scoring rules (simple and explainable)
 * - Start at 100.
 * - -5 points per incorrect guess submitted.
 * - -10 points if the player fails (does not solve in 6 guesses).
 * - Minimum 0.
 */
export function computeScore(params: { success: boolean; attemptsUsed: number }) {
  const incorrectGuesses = params.success ? Math.max(0, params.attemptsUsed - 1) : params.attemptsUsed;
  const guessPenalty = incorrectGuesses * 5;
  const failPenalty = params.success ? 0 : 10;
  return Math.max(0, 100 - guessPenalty - failPenalty);
}

/**
 * Deterministically picks an item from a list based on a seed string.
 *
 * Why this exists
 * - In training content, it's helpful to force a known puzzle for testing:
 *   `?seed=2` or `?seed=patch`
 *
 * Rules
 * - If seed is a number in range, use it as an index.
 * - If seed matches a word (case-insensitive), use that exact word.
 * - Otherwise, hash the seed into a stable index.
 */
export function pickFromSeed(params: { seed: string; items: string[] }) {
  const { seed, items } = params;
  if (items.length === 0) throw new Error("pickFromSeed requires a non-empty items array.");

  const trimmed = seed.trim();
  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber < items.length) {
    return items[asNumber]!;
  }

  const normalized = trimmed.toLowerCase();
  const exact = items.find((w) => w.toLowerCase() === normalized);
  if (exact) return exact;

  // Simple string hash (fast, stable, good enough for MVP).
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length]!;
}

