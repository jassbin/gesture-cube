"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Face } from "@/lib/cube/model";

export type CamStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported";

export type HandFrame = {
  present: boolean;
  x: number;
  y: number;
  landmarks: { x: number; y: number }[];
  fps: number;
};

export type SwipeDir = "left" | "right" | "up" | "down";

// A real "grab a face and drag" gesture, reported in mirrored screen space
// (what the user sees): start point in 0..1 plus a normalized drag delta.
export type FingerTwist = {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
};

type Callbacks = {
  onFrame?: (f: HandFrame) => void;
  onSpin?: (dx: number, dy: number) => void;
  onFingerTwist?: (twist: FingerTwist) => void;
};

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export function useHandTracking(cbs: Callbacks) {
  const [status, setStatus] = useState<CamStatus>("idle");
  const cbRef = useRef(cbs);
  useEffect(() => {
    cbRef.current = cbs;
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const prevPalm = useRef<{ x: number; y: number; t: number } | null>(null);
  // fingertip drag state machine (mirrored screen coords)
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastMoveT: number;
  } | null>(null);
  const lastTwist = useRef(0);
  const runningRef = useRef(false);
  const frameTimes = useRef<number[]>([]);

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  const loop = useCallback(function loop() {
    const video = videoRef.current;
    const lm = landmarkerRef.current as {
      detectForVideo: (
        v: HTMLVideoElement,
        t: number,
      ) => { landmarks: { x: number; y: number }[][] };
    } | null;
    if (!runningRef.current || !video || !lm) return;

    if (video.readyState >= 2) {
      const now = performance.now();
      const res = lm.detectForVideo(video, now);
      frameTimes.current.push(now);
      if (frameTimes.current.length > 20) frameTimes.current.shift();
      const ft = frameTimes.current;
      const fps =
        ft.length > 1
          ? Math.round((1000 * (ft.length - 1)) / (ft[ft.length - 1] - ft[0]))
          : 0;

      const hands = res.landmarks;
      if (hands && hands.length > 0) {
        const pts = hands[0];
        const cx = (pts[0].x + pts[9].x) / 2;
        const cy = (pts[0].y + pts[9].y) / 2;
        cbRef.current.onFrame?.({
          present: true,
          x: cx,
          y: cy,
          landmarks: pts.map((p) => ({ x: p.x, y: p.y })),
          fps,
        });

        const prev = prevPalm.current;
        if (prev) {
          const dx = cx - prev.x;
          const dy = cy - prev.y;
          const dt = now - prev.t;
          cbRef.current.onSpin?.(dx * 3.2, dy * 3.2);
          const speed = Math.hypot(dx, dy) / Math.max(dt, 1);
          if (speed > 0.0022 && now - lastSwipe.current > 650) {
            lastSwipe.current = now;
            let dir: SwipeDir;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? "right" : "left";
            else dir = dy > 0 ? "down" : "up";
            cbRef.current.onSwipe?.(dir);
          }
        }
        prevPalm.current = { x: cx, y: cy, t: now };
      } else {
        prevPalm.current = null;
        cbRef.current.onFrame?.({
          present: false,
          x: 0.5,
          y: 0.5,
          landmarks: [],
          fps,
        });
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(
    async (video: HTMLVideoElement) => {
      videoRef.current = video;
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setStatus("unsupported");
        return;
      }
      setStatus("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const landmarker = await vision.HandLandmarker.createFromOptions(
          fileset,
          {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
          },
        );
        landmarkerRef.current = landmarker;
        runningRef.current = true;
        setStatus("active");
        loop();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setStatus(name === "NotAllowedError" ? "denied" : "unsupported");
      }
    },
    [loop],
  );

  useEffect(() => () => stop(), [stop]);

  return { status, start, stop };
}

export function swipeToMove(dir: SwipeDir): { face: Face; cw: boolean } {
  switch (dir) {
    case "right":
      return { face: "U", cw: true };
    case "left":
      return { face: "U", cw: false };
    case "up":
      return { face: "R", cw: true };
    case "down":
      return { face: "R", cw: false };
  }
}
