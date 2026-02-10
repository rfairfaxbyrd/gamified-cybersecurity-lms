/**
 * What this file does
 * - Provides a tiny CSV generator for the admin export endpoint.
 *
 * Why we roll our own (plain English)
 * - MVP keeps dependencies small.
 * - Our CSV needs are simple (a flat table).
 *
 * How it works
 * - `toCsv()` takes headers + rows and returns a CSV string.
 * - Values are escaped according to basic CSV rules:
 *   - wrap in quotes if it contains comma, quote, or newline
 *   - double any quotes inside
 *
 * How to change it
 * - If you later need more complex CSV, consider adding a library.
 */

function escapeCsvValue(value: unknown) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvValue).join(","));

  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvValue(row[h])).join(","));
  }

  // CSV files commonly end with a newline.
  return `${lines.join("\n")}\n`;
}

