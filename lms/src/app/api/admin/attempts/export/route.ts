import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

/**
 * What this file does
 * - Admin-only CSV export for attempts (scores/completions).
 *
 * Key concepts (plain English)
 * - This is an "API endpoint" that returns a downloadable file.
 * - Only admins should access it.
 *
 * How it works
 * 1) Check session + role.
 * 2) Query attempts with user + module info.
 * 3) Convert rows to CSV.
 * 4) Return response with CSV headers.
 *
 * How to change it
 * - Add/remove columns by editing `headers` and `rows`.
 */

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attempts = await prisma.attempt.findMany({
    include: {
      user: { select: { email: true, name: true } },
      module: { select: { id: true, title: true, topic: true, difficulty: true } }
    },
    orderBy: { startedAt: "desc" }
  });

  const headers = [
    "attempt_id",
    "user_email",
    "user_name",
    "module_id",
    "module_title",
    "module_topic",
    "module_difficulty",
    "score",
    "completed",
    "started_at",
    "completed_at"
  ];

  const rows = attempts.map((a) => ({
    attempt_id: a.id,
    user_email: a.user.email,
    user_name: a.user.name,
    module_id: a.module.id,
    module_title: a.module.title,
    module_topic: a.module.topic,
    module_difficulty: a.module.difficulty,
    score: a.score ?? "",
    completed: a.completed ? "true" : "false",
    started_at: a.startedAt.toISOString(),
    completed_at: a.completedAt ? a.completedAt.toISOString() : ""
  }));

  const csv = toCsv(headers, rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attempts.csv"'
    }
  });
}

