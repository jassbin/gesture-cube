"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  // true while thumb + index are pinched together (grabbing a face)
  pinching: boolean;
  // pinch midpoint in mirrored screen space (0..1), valid while pinching
  pinchX: number;
  pinchY: number;
  // thumb tip (4) and index tip (8) in mirrored screen space (0..1)
  thumbX: number;
  thumbY: number;
  indexX: number;
  indexY: number;
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

        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
          Math.hypot(a.x - b.x, a.y - b.y);

        // --- pinch detection: thumb tip (4) close to index tip (8) ---
        // Scale threshold by hand size (wrist→index-mcp) so it works at any
        // distance from the camera.
        const handSpan = dist(pts[0], pts[5]) || 0.15;
        const pinchGap = dist(pts[4], pts[8]);
        const pinching = pinchGap < handSpan * 0.55;

        // pinch midpoint in mirrored screen space (what the user sees)
        const mx = 1 - (pts[4].x + pts[8].x) / 2;
        const my = (pts[4].y + pts[8].y) / 2;
        const thumbX = 1 - pts[4].x;
        const thumbY = pts[4].y;
        const indexX = 1 - pts[8].x;
        const indexY = pts[8].y;

        cbRef.current.onFrame?.({
          present: true,
          x: cx,
          y: cy,
          landmarks: pts.map((p) => ({ x: p.x, y: p.y })),
          pinching,
          pinchX: mx,
          pinchY: my,
          thumbX,
          thumbY,
          indexX,
          indexY,
          fps,
        });

        if (pinching) {
          // grabbing a face: pause whole-cube spin and track the drag
          prevPalm.current = null;
          const d = dragRef.current;
          if (!d || !d.active) {
            dragRef.current = {
              active: true,
              startX: mx,
              startY: my,
              lastX: mx,
              lastY: my,
              lastMoveT: now,
            };
          } else {
            d.lastX = mx;
            d.lastY = my;
          }
        } else {
          // released: if we were pinching and dragged far enough, twist once
          const d = dragRef.current;
          if (d && d.active) {
            const dx = d.lastX - d.startX;
            const dy = d.lastY - d.startY;
            const total = Math.hypot(dx, dy);
            if (total > 0.05 && now - lastTwist.current > 400) {
              lastTwist.current = now;
              cbRef.current.onFingerTwist?.({
                startX: d.startX,
                startY: d.startY,
                dx,
                dy,
              });
            }
            dragRef.current = null;
          }
          // open hand → whole-cube spin from palm motion
          const prev = prevPalm.current;
          if (prev) {
            const sdx = cx - prev.x;
            const sdy = cy - prev.y;
            cbRef.current.onSpin?.(sdx * 3.2, sdy * 3.2);
          }
          prevPalm.current = { x: cx, y: cy, t: now };
        }
      } else {
        prevPalm.current = null;
        dragRef.current = null;
        cbRef.current.onFrame?.({
          present: false,
          x: 0.5,
          y: 0.5,
          landmarks: [],
          pinching: false,
          pinchX: 0.5,
          pinchY: 0.5,
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
          video: { facingMode: { ideal: "user" } },
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
