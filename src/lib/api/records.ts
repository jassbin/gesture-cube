import { request } from "./request";

export type SolveRecord = {
  id: string;
  timeMs: number;
  moves: number;
  mode: "gesture" | "touch";
  createdAt: string; // ISO
};

export type NewSolveRecord = {
  timeMs: number;
  moves: number;
  mode: "gesture" | "touch";
};

export async function fetchRecords(): Promise<SolveRecord[]> {
  const res = await request("/api/records");
  if (!res.ok) throw new Error("failed to load records");
  const json = (await res.json()) as { ok: boolean; records: SolveRecord[] };
  return json.records ?? [];
}

export async function createRecord(
  input: NewSolveRecord,
): Promise<SolveRecord> {
  const res = await request("/api/records", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("failed to save record");
  const json = (await res.json()) as { ok: boolean; record: SolveRecord };
  return json.record;
}
