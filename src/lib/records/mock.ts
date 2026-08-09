import type { SolveRecord } from "@/lib/api/records";

// Frontend-first sample data — replaced by real persistence after confirmation.
export const MOCK_RECORDS: SolveRecord[] = [
  {
    id: "m1",
    timeMs: 62340,
    moves: 41,
    mode: "gesture",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: "m2",
    timeMs: 88120,
    moves: 58,
    mode: "touch",
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "m3",
    timeMs: 71900,
    moves: 47,
    mode: "gesture",
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
];
