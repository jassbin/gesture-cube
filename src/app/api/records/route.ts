import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { insertSolve, listSolvesByUser } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const rows = await listSolvesByUser(auth.user.id);
  const records = rows.map((r) => ({
    id: r.id,
    timeMs: r.timeMs,
    moves: r.moves,
    mode: r.mode,
    createdAt: r.createdAt.toISOString(),
  }));
  return NextResponse.json({ ok: true, records });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  let body: { timeMs?: number; moves?: number; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const timeMs = Number(body.timeMs);
  const moves = Number(body.moves);
  const mode = body.mode === "gesture" ? "gesture" : "touch";
  if (!Number.isFinite(timeMs) || timeMs <= 0 || !Number.isFinite(moves) || moves <= 0) {
    return NextResponse.json({ ok: false, error: "invalid values" }, { status: 400 });
  }

  const row = await insertSolve({
    id: crypto.randomUUID(),
    userId: auth.user.id,
    timeMs: Math.round(timeMs),
    moves: Math.round(moves),
    mode,
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: row.id,
      timeMs: row.timeMs,
      moves: row.moves,
      mode: row.mode,
      createdAt: row.createdAt.toISOString(),
    },
  });
}
