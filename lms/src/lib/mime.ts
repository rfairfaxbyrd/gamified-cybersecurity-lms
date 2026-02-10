/**
 * What this file does
 * - Provides a tiny "guess content type" helper for serving files from /content.
 *
 * Why we need this (plain English)
 * - When we serve files (HTML, JS, CSS, images) the browser needs the correct
 *   Content-Type header to display/run them.
 *
 * How it works
 * - We look at the file extension and return a basic MIME type.
 *
 * How to change it
 * - Add more extensions if you add new asset types to /content.
 */

export function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  if (lower.endsWith(".eot")) return "application/vnd.ms-fontobject";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".h5p")) return "application/octet-stream";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}
