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
  type HandFrame,
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
  const grabbedFace = useRef<{ axis: "x" | "y" | "z"; sign: number } | null>(
    null,
  );
  const queueRef = useRef<Move[]>([]);
  const scramblingRef = useRef(false);

  const [mode, setMode] = useState<Mode>("touch");
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [displayTime, setDisplayTime] = useState("0.00");
  const [gestureFlash, setGestureFlash] = useState<
    { id: number; kind: "rotate" | "twist" } | null
  >(null);
  const flashSeq = useRef(0);
  const lastRotateFlash = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = useCallback((kind: "rotate" | "twist") => {
    flashSeq.current += 1;
    setGestureFlash({ id: flashSeq.current, kind });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setGestureFlash(null), 700);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
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
  const onSpin = useCallback(
    (dx: number, dy: number) => {
      sceneRef.current?.addSpin(dx, dy);
      // Flash "rotating" when the hand actually moves the cube (throttled).
      const mag = Math.hypot(dx, dy);
      const now = performance.now();
      if (mag > 0.06 && now - lastRotateFlash.current > 500) {
        lastRotateFlash.current = now;
        showFlash("rotate");
      }
    },
    [showFlash],
  );

  const onFingerTwist = useCallback(
    (twist: { startX: number; startY: number; dx: number; dy: number }) => {
      if (mode !== "gesture" || scramblingRef.current) return;
      const scene = sceneRef.current;
      if (!scene) return;
      // Prefer the face we've been highlighting (voted from both fingers), so
      // the layer that turns is exactly the one shown as grabbed.
      const face = grabbedFace.current;
      const move = face
        ? scene.solveTwistFromFace(face.axis, face.sign, twist.dx, twist.dy)
        : scene.solveTwistFromDrag(
            twist.startX,
            twist.startY,
            twist.dx,
            twist.dy,
          );
      if (!move) return;
      showFlash("twist");
      runTurn(move);
    },
    [mode, runTurn, showFlash],
  );

  const hands = useHandTracking({
    onFrame: setFrame,
    onSpin,
    onFingerTwist,
  });

  // ---- live face highlight while pinching ----
  // FREE + pinching → show only the two touched cubes (preview).
  // LOCKED → light the whole grabbed face and freeze it (no re-vote).
  const [pinchHit, setPinchHit] = useState(false);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (mode === "gesture" && hands.status === "active" && frame?.pinching) {
      if (frame.locked) {
        const hit = scene.pickFaceAt(
          frame.thumbX,
          frame.thumbY,
          frame.indexX,
          frame.indexY,
          true, // freeze: keep the locked face, don't re-vote
        );
        setPinchHit(hit);
        grabbedFace.current = hit ? scene.grabbedFace() : null;
      } else {
        // preview: only the two touched cubes, face not locked yet
        scene.showTipsOnly(
          frame.thumbX,
          frame.thumbY,
          frame.indexX,
          frame.indexY,
        );
        setPinchHit(false);
        grabbedFace.current = null;
      }
    } else {
      scene.clearFaceHighlight();
      setPinchHit(false);
      grabbedFace.current = null;
    }
  }, [frame, mode, hands.status]);

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
    if (Math.hypot(dx, dy) < 24) return; // treat as tap, not twist
    const scene = sceneRef.current;
    if (!scene) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // real face-twist solve from the drag start point + delta (normalized)
    const move = scene.solveTwistFromDrag(
      (s.x - rect.left) / rect.width,
      (s.y - rect.top) / rect.height,
      dx / rect.width,
      dy / rect.height,
    );
    if (move) runTurn(move);
  };

  const cameraActive = hands.status === "active";

  return (
    <div className="fui-broadcast-field fixed inset-0 overflow-hidden">
      {/* front camera feed — used only as input for hand tracking, never
          shown to the user. Kept in DOM (opacity 0) so MediaPipe can read it;
          the FUI background color stays visible behind the cube + skeleton. */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
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
        gestureFlash={gestureFlash}
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

      {/* pinch grab cue — shows when a pinch is actually grabbing a face */}
      {mode === "gesture" && cameraActive && pinchHit && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center px-8">
          <div className="fui-chip rounded-full px-4 py-2 text-xs font-semibold text-[#ffb020] fui-glow-orange">
            {t("play.pinchGrab")}
          </div>
        </div>
      )}

      {/* experimental gesture hint — kept near the bottom, clear of banner/flash */}
      {mode === "gesture" && cameraActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[150px] z-20 px-8 text-center">
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
