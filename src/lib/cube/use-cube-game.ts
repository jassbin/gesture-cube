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
  const movesRef = useRef(0);
  const statusRef = useRef<GameStatus>("idle");

  const applyLogical = useCallback(
    (move: Move): { solved: boolean; result: SolveResult | null } => {
      stateRef.current = applyMove(stateRef.current, move);
      movesRef.current += 1;
      setMoves(movesRef.current);
      if (statusRef.current === "solving" && isSolved(stateRef.current)) {
        const res = { timeMs: Date.now() - startRef.current, moves: movesRef.current };
        setResult(res);
        statusRef.current = "solved";
        setStatus("solved");
        return { solved: true, result: res };
      }
      return { solved: false, result: null };
    },
    [],
  );

  const doScramble = useCallback((): Move[] => {
    const { moves: seq } = scramble(stateRef.current, 24);
    movesRef.current = 0;
    setMoves(0);
    setResult(null);
    statusRef.current = "solving";
    setStatus("solving");
    startRef.current = Date.now();
    return seq;
  }, []);

  const reset = useCallback(() => {
    stateRef.current = solvedState();
    movesRef.current = 0;
    setMoves(0);
    setResult(null);
    statusRef.current = "idle";
    setStatus("idle");
  }, []);

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
