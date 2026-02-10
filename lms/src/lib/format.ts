/**
 * What this file does
 * - Small formatting helpers for UI labels.
 *
 * How to change it
 * - Add more helpers as needed (dates, numbers, etc.).
 */

export function humanizeEnum(value: string) {
  // Example: "DEEPFAKES" -> "Deepfakes", "SCORM_PLACEHOLDER" -> "Scorm placeholder"
  const lower = value.replaceAll("_", " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

