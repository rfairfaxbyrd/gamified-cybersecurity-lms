import type { CyberHillChoice, CyberHillQuestion } from "@/lib/cyberHillQuestions";

/**
 * What this file does
 * - Holds the small, pure helper functions for Cyber Hill Climber.
 * - Keeping these functions separate from React makes the game easier to test and safer to change.
 *
 * How stage progression works
 * - `questionsAnswered` means "how many safe answers the player has earned so far."
 * - Reaching the total number of questions means the player reached the summit.
 *
 * How answer checking works
 * - Each question has 2 choices.
 * - Exactly 1 choice is marked `isCorrect: true`.
 * - The helpers below find that safer answer and calculate score from progress.
 *
 * How answer randomization works
 * - We want the safer choice to appear on the left sometimes and on the right
 *   other times, otherwise the game becomes predictable.
 * - We do *not* use `Math.random()` directly during rendering because that can
 *   reshuffle buttons on every render and feel glitchy.
 * - Instead, we combine the question id with a per-run seed and make one stable
 *   left/right decision for that question during that run.
 */

export function getCorrectChoice(question: CyberHillQuestion): CyberHillChoice {
  return question.choices.find((choice) => choice.isCorrect) ?? question.choices[0];
}

function hashString(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getPresentedChoices(
  question: CyberHillQuestion,
  runSeed: number
): [CyberHillChoice, CyberHillChoice] {
  const shouldReverse = hashString(`${question.id}:${runSeed}`) % 2 === 1;
  return shouldReverse
    ? [question.choices[1], question.choices[0]]
    : [question.choices[0], question.choices[1]];
}

export function computeCyberHillScore(params: {
  questionsAnswered: number;
  totalQuestions: number;
  success: boolean;
}) {
  const { questionsAnswered, totalQuestions, success } = params;
  if (totalQuestions <= 0) return 0;
  if (success) return 100;

  // MVP scoring:
  // - Progress farther up the mountain = better score.
  // - Losing late still earns credit for the safer decisions already made.
  return Math.round((questionsAnswered / totalQuestions) * 100);
}

export function formatStageLabel(params: {
  questionsAnswered: number;
  totalQuestions: number;
  completed: boolean;
}) {
  if (params.completed) return `Completed ${params.questionsAnswered} of ${params.totalQuestions}`;
  return `Stage ${Math.min(params.questionsAnswered + 1, params.totalQuestions)} of ${params.totalQuestions}`;
}
