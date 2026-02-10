import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { guessContentType } from "@/lib/mime";
import { resolveContentPath } from "@/lib/content";

/**
 * What this file does
 * - Serves files from the repository-level `/content` folder.
 *
 * Why this exists (plain English)
 * - Next.js only serves static files from `/public`.
 * - We want a single shared `/content` folder (outside the Next.js app) so content
 *   can be updated without rebuilding the app.
 *
 * How it works
 * - URL: /api/content/<path...>
 * - The handler maps the URL path to a file under CONTENT_DIR (or ../content).
 * - It blocks path traversal and returns 404 for missing files.
 *
 * How to change it
 * - If you later move content to S3/CDN, you can replace this route with redirects.
 */

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const filePath = resolveContentPath(params.path);
  if (!filePath) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

  try {
    const stat = await fs.stat(filePath);
    let finalPath = filePath;

    // If the request points to a folder, attempt to serve index.html.
    if (stat.isDirectory()) {
      const indexHtml = path.join(finalPath, "index.html");
      const indexHtm = path.join(finalPath, "index.htm");
      try {
        await fs.access(indexHtml);
        finalPath = indexHtml;
      } catch {
        await fs.access(indexHtm);
        finalPath = indexHtm;
      }
    }

    const data = await fs.readFile(finalPath);
    const contentType = guessContentType(finalPath);

    const headers = new Headers();
    headers.set("Content-Type", contentType);

    // If the user requests a `.h5p` package, encourage download instead of trying to render raw bytes.
    if (finalPath.toLowerCase().endsWith(".h5p")) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${path.basename(finalPath)}"`
      );
    }

    return new NextResponse(data, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
