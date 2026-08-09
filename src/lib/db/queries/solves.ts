import { desc, eq } from "drizzle-orm";
import { db } from "../client";
import { solves, type Solve } from "../schema/solves";

export async function listSolvesByUser(userId: string): Promise<Solve[]> {
  return db
    .select()
    .from(solves)
    .where(eq(solves.userId, userId))
    .orderBy(desc(solves.createdAt))
    .limit(100);
}

export async function insertSolve(data: {
  id: string;
  userId: string;
  timeMs: number;
  moves: number;
  mode: string;
}): Promise<Solve> {
  const rows = await db.insert(solves).values(data).returning();
  return rows[0];
}
