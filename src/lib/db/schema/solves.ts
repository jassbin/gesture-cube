import type { InferSelectModel } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const solves = pgTable(
  "solves",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    timeMs: integer("time_ms").notNull(),
    moves: integer("moves").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(), // "gesture" | "touch"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("solves_user_idx").on(table.userId),
    userTimeIdx: index("solves_user_time_idx").on(table.userId, table.timeMs),
  }),
);

export type Solve = InferSelectModel<typeof solves>;
