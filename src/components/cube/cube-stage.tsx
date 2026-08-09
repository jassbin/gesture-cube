"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, RotateCcw, Shuffle, Hand, Pointer } from "lucide-react";
import { toast } from "sonner";
import { memory } from "@eazo/sdk";
import { CubeScene } from "@/lib/cube/scene";
import { useGyroParallax } from "@/lib/cube/use-gyro";
import {
  useHandTracking,
  swipeToMove,
  type HandFrame,
  type SwipeDir,
} from "@/lib/cube/use-hands";
import { useCubeGame } from "@/lib/cube/use-cube-game";
import { formatTime } from "@/lib/cube/format";
import type { Move } from "@/lib/cube/model";
import { applyMove } from "@/lib/cube/model";
import { HandSkeleton } from "./hand-skeleton";
import { HudChips } from "./hud-chips";
import { SolvedSheet } from "./solved-sheet";
import { cn } from "@/utils/utils";

type Mode = "gesture" | "touch";

export function CubeStage() {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const queueRef = useRef<Move[]>([]);
  const scramblingRef = useRef(false);

  const [mode, setMode] = useState<Mode>("touch");
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [displayTime, setDisplayTime] = useState("0.00");
  const game = useCubeGame();
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  });

  // ---- Three.js scene lifecycle ----
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new CubeScene(canvasRef.current);
    sceneRef.current = scene;
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- live timer ----
  useEffect(() => {
    if (game.status !== "solving") return;
    const start = Date.now();
    const id = setInterval(() => {
      setDisplayTime(formatTime(Date.now() - start));
    }, 33);
    return () => clearInterval(id);
  }, [game.status]);

  // ---- gyro parallax ----
  const gyro = useGyroParallax((nx, ny) => {
    sceneRef.current?.setParallax(nx, ny);
  });

  // ---- process a visual+logical turn through the scene ----
  const runTurnRef = useRef<(move: Move, isScramble?: boolean) => boolean>(
    () => false,
  );
  const runTurn = useCallback((move: Move, isScramble = false) => {
    const scene = sceneRef.current;
    if (!scene || scene.isAnimating) return false;
    scene.turn(
      move,
      () => {
        if (!isScramble) {
          const r = gameRef.current.applyLogical(move);
          if (r.solved) {
            memory
              .reportAction({
                content: `Solved the cube in ${r.result?.moves} moves`,
                event_type: "solve_cube",
                page: "play",
                metadata: {
                  type: "cube_solve",
                  timeMs: r.result?.timeMs,
                  moves: r.result?.moves,
                },
              })
              .catch(() => {});
          }
        }
        // drain scramble queue
        if (queueRef.current.length > 0) {
          const next = queueRef.current.shift()!;
          runTurnRef.current(next, true);
        } else if (scramblingRef.current) {
          scramblingRef.current = false;
          gameRef.current.markStart();
        }
      },
      isScramble ? 130 : 240,
    );
    return true;
  }, []);
  useEffect(() => {
    runTurnRef.current = runTurn;
  });

  // ---- hand tracking gesture handling ----
  const onSpin = useCallback((dx: number, dy: number) => {
    sceneRef.current?.addSpin(dx, dy);
  }, []);

  const onSwipe = useCallback(
    (dir: SwipeDir) => {
      if (mode !== "gesture" || scramblingRef.current) return;
      const move = swipeToMove(dir);
      runTurn(move);
    },
    [mode, runTurn],
  );

  const hands = useHandTracking({
    onFrame: setFrame,
    onSpin,
    onSwipe,
  });

  // ---- controls ----
  const handleScramble = useCallback(() => {
    if (scramblingRef.current || sceneRef.current?.isAnimating) return;
    const seq = gameRef.current.doScramble();
    if (seq.length === 0) return;
    scramblingRef.current = true;
    // Apply the whole scramble to the logical state up front so solve
    // detection is correct, then replay each move visually only (isScramble).
    seq.forEach((m) => {
      gameRef.current.stateRef.current = applyMove(
        gameRef.current.stateRef.current,
        m,
      );
    });
    queueRef.current = seq.slice(1);
    runTurn(seq[0], true);
  }, [runTurn]);

  const handleReset = useCallback(() => {
    queueRef.current = [];
    scramblingRef.current = false;
    gameRef.current.reset();
    setDisplayTime("0.00");
    // rebuild scene to solved
    if (canvasRef.current) {
      sceneRef.current?.dispose();
      const scene = new CubeScene(canvasRef.current);
      sceneRef.current = scene;
    }
  }, []);

  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    await hands.start(videoRef.current);
    setMode("gesture");
  }, [hands]);

  // React to a camera denial reported by the tracking hook (event-driven,
  // toast only — mode stays touch because gesture never activated).
  const notifiedDenied = useRef(false);
  useEffect(() => {
    if (hands.status === "denied" && !notifiedDenied.current) {
      notifiedDenied.current = true;
      toast(t("play.cameraDenied"));
    }
    if (hands.status !== "denied") notifiedDenied.current = false;
  }, [hands.status, t]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "gesture" ? "touch" : "gesture"));
  }, []);

  // ---- touch-to-twist (reliable fallback) ----
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s || scramblingRef.current) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 30) return; // treat as tap, not twist
    let dir: SwipeDir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? "right" : "left";
    else dir = dy > 0 ? "down" : "up";
    runTurn(swipeToMove(dir));
  };

  const cameraActive = hands.status === "active";

  return (
    <div className="fui-broadcast-field fixed inset-0 overflow-hidden">
      {/* rear camera background */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
          cameraActive ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: "scaleX(-1)" }}
      />
      {/* dot grid overlay */}
      <div className="fui-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[#0d1a52]/25" />

      {/* cube canvas + touch twist surface */}
      <div
        data-el="cube-stage"
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* hand skeleton overlay */}
      {mode === "gesture" && cameraActive && (
        <HandSkeleton frame={frame} />
      )}

      {/* HUD */}
      <HudChips
        time={displayTime}
        moves={game.moves}
        frame={mode === "gesture" ? frame : null}
        mode={mode}
      />

      {/* gyro permission prompt */}
      {gyro.status === "need-permission" && (
        <button
          data-el="gyro-permission"
          onClick={gyro.start}
          className="fui-chip absolute left-1/2 top-[42%] z-30 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold text-white"
        >
          {t("play.enableGyro")}
        </button>
      )}

      {/* experimental gesture hint */}
      {mode === "gesture" && cameraActive && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-20 px-8 text-center">
          <p className="fui-mono text-[10px] uppercase tracking-wider text-secondary/90">
            {t("play.experimentalSwipe")}
          </p>
        </div>
      )}
      {mode === "touch" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[150px] z-20 px-8 text-center">
          <p className="fui-mono text-[10px] uppercase tracking-wider text-white/60">
            {t("play.twistHint")}
          </p>
        </div>
      )}

      {/* bottom controls (above the nav) */}
      <div
        data-el="cube-controls"
        className="absolute inset-x-0 z-30 flex flex-col items-center gap-3 px-4"
        style={{ bottom: "82px" }}
      >
        <div className="flex items-center gap-2">
          <ControlButton
            el="btn-scramble"
            icon={<Shuffle className="h-4 w-4" />}
            label={t("play.controls.scramble")}
            primary
            onClick={handleScramble}
          />
          <ControlButton
            el="btn-reset"
            icon={<RotateCcw className="h-4 w-4" />}
            label={t("play.controls.reset")}
            onClick={handleReset}
          />
          {cameraActive ? (
            <ControlButton
              el="btn-mode"
              icon={
                mode === "gesture" ? (
                  <Hand className="h-4 w-4" />
                ) : (
                  <Pointer className="h-4 w-4" />
                )
              }
              label={
                mode === "gesture"
                  ? t("play.hud.gesture")
                  : t("play.hud.touch")
              }
              onClick={toggleMode}
            />
          ) : (
            <ControlButton
              el="btn-camera"
              icon={<Camera className="h-4 w-4" />}
              label={t("play.enableCamera")}
              onClick={enableCamera}
            />
          )}
        </div>
      </div>

      <SolvedSheet
        result={game.status === "solved" ? game.result : null}
        mode={mode}
        locale={i18n.language}
        onPlayAgain={() => {
          handleReset();
          handleScramble();
        }}
      />
    </div>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  primary,
  el,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  el?: string;
}) {
  return (
    <button
      data-el={el}
      onClick={onClick}
      className={cn(
        "fui-chip flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-transform active:scale-95",
        primary
          ? "bg-primary text-primary-foreground fui-glow-orange"
          : "text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
