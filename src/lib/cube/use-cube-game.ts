"use client";

import { useCallback, useRef, useState } from "react";
import {
  applyMove,
  isSolved,
  scramble,
  solvedState,
  type CubeState,
  type Move,
} from "@/lib/cube/model";

export type GameStatus = "idle" | "solving" | "solved";

export type SolveResult = { timeMs: number; moves: number };

// Owns cube logical state + timer + move count. Visual turns are delegated
// to the caller (Three.js scene); this hook is the source of truth for logic.
export function useCubeGame() {
  const [status, setStatus] = useState<GameStatus>("idle");
  const [moves, setMoves] = useState(0);
  const [result, setResult] = useState<SolveResult | null>(null);
  const stateRef = useRef<CubeState>(solvedState());
  const startRef = useRef<number>(0);

  const applyLogical = useCallback(
    (move: Move): { solved: boolean; result: SolveResult | null } => {
      stateRef.current = applyMove(stateRef.current, move);
      let nextMoves = 0;
      setMoves((m) => {
        nextMoves = m + 1;
        return nextMoves;
      });
      if (status === "solving" && isSolved(stateRef.current)) {
        const timeMs = Date.now() - startRef.current;
        const res = { timeMs, moves: nextMoves };
        setResult(res);
        setStatus("solved");
        return { solved: true, result: res };
      }
      return { solved: false, result: null };
    },
    [status],
  );

  // Returns the sequence of moves to visually replay the scramble.
  const doScramble = useCallback((): Move[] => {
    const { moves: seq } = scramble(stateRef.current, 24);
    // We DON'T apply to stateRef here; caller applies each move through
    // applyLogical as the visual animation completes to keep sync.
    setMoves(0);
    setResult(null);
    setStatus("solving");
    startRef.current = Date.now();
    return seq;
  }, []);

  const reset = useCallback(() => {
    stateRef.current = solvedState();
    setMoves(0);
    setResult(null);
    setStatus("idle");
  }, []);

  // begin timing only after scramble visual finishes
  const markStart = useCallback(() => {
    startRef.current = Date.now();
  }, []);

  return {
    status,
    moves,
    result,
    stateRef,
    applyLogical,
    doScramble,
    reset,
    markStart,
  };
}
