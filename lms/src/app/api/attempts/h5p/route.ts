import { z } from "zod";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { syncUserBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";

/**
 * What this file does
 * - Receives "finished" score reports from embedded H5P content and stores them as Attempts.
 *
 * Why this exists (plain English)
 * - H5P content can report results when an activity is completed.
 * - The `h5p-standalone` runtime (our embed library) can be configured to POST to an endpoint
 *   when a module is finished (via `H5PIntegration.ajax.setFinished`).
 * - This endpoint turns that POST into our LMS data:
 *   - Attempt.score (0–100 percent)
 *   - Attempt.completed = true
 *
 * How it works
 * 1) Require a signed-in user (NextAuth session cookie).
 * 2) Read the moduleId from the query string (so the H5P runtime doesn't need to know our DB).
 * 3) Parse the H5P POST body (usually `application/x-www-form-urlencoded` from jQuery.post).
 * 4) Convert raw score/maxScore into a percent (0–100).
 * 5) Create an Attempt and sync badges.
 *
 * How to change it
 * - If you want to store raw points too, add fields to `Attempt` in Prisma and save them here.
 * - If you want to be stricter about what counts as "completed", add extra checks here.
 */

export const runtime = "nodejs";

const h5pFinishedSchema = z.object({
  contentId: z.string().optional(),
  score: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  opened: z.coerce.number().optional(), // seconds since epoch
  finished: z.coerce.number().optional(), // seconds since epoch
  time: z.coerce.number().optional()
});

function clampPercent(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function readUrlEncodedBody(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const moduleId = url.searchParams.get("moduleId")?.trim();
  if (!moduleId) {
    return NextResponse.json({ error: "Missing moduleId" }, { status: 400 });
  }

  const trainingModule = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!trainingModule) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  // H5P's `setFinished(...)` uses `jQuery.post(...)`, which sends urlencoded form data.
  const contentType = req.headers.get("content-type") ?? "";

  let raw: Record<string, string> = {};
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      raw = await readUrlEncodedBody(req);
    } else {
      // Fallback: allow multipart form-data (rare) or JSON (manual testing).
      const asForm = await req.formData().catch(() => null);
      if (asForm) {
        for (const [k, v] of asForm.entries()) {
          if (typeof v === "string") raw[k] = v;
        }
      } else {
        const asJson = (await req.json().catch(() => null)) as unknown;
        if (asJson && typeof asJson === "object") {
          for (const [k, v] of Object.entries(asJson as Record<string, unknown>)) {
            if (typeof v === "string" || typeof v === "number") raw[k] = String(v);
          }
        }
      }
    }
  } catch {
    // If parsing fails, we still respond with a clear error (so H5P can retry if needed).
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  const parsed = h5pFinishedSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { score, maxScore, opened, finished } = parsed.data;

  // Convert raw points to a percent score (0–100) to match our MVP schema.
  // Example: score=7, maxScore=10 -> 70%
  const percent =
    typeof score === "number" && typeof maxScore === "number" && maxScore > 0
      ? clampPercent((score / maxScore) * 100)
      : null;

  const now = new Date();
  const startedAt = typeof opened === "number" ? new Date(opened * 1000) : now;
  const completedAt = typeof finished === "number" ? new Date(finished * 1000) : now;

  await prisma.attempt.create({
    data: {
      userId: session.user.id,
      moduleId: trainingModule.id,
      score: percent,
      completed: true,
      startedAt,
      completedAt
    }
  });

  // Marking complete can unlock badges.
  await syncUserBadges(session.user.id);

  return NextResponse.json({ ok: true, moduleId: trainingModule.id, score: percent });
}

