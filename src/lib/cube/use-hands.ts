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
  // true once a pinch has held still long enough to lock the whole face
  locked: boolean;
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
  // hysteresis + smoothing state
  const pinchState = useRef(false);
  const smThumb = useRef<{ x: number; y: number } | null>(null);
  const smIndex = useRef<{ x: number; y: number } | null>(null);
  // FREE / LOCKED face state machine
  const lockState = useRef<"free" | "locked">("free");
  const lockSpan = useRef(0.15);
  const stillSince = useRef(0);
  const prevMid = useRef<{ x: number; y: number } | null>(null);
  const lockTwistStart = useRef<{ x: number; y: number } | null>(null);

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

        // --- pinch detection with hysteresis ---
        const handSpan = dist(pts[0], pts[5]) || 0.15;
        const pinchGap = dist(pts[4], pts[8]);
        const ratio = pinchGap / handSpan;
        if (!pinchState.current && ratio < 0.5) pinchState.current = true;
        else if (pinchState.current && ratio > 0.75) pinchState.current = false;
        const pinching = pinchState.current;

        // low-pass filter the two touch points (rear camera → no mirror)
        const rawThumb = { x: pts[4].x, y: pts[4].y };
        const rawIndex = { x: pts[8].x, y: pts[8].y };
        const a = 0.45;
        const lp = (
          prev: { x: number; y: number } | null,
          raw: { x: number; y: number },
        ) =>
          prev
            ? { x: prev.x + (raw.x - prev.x) * a, y: prev.y + (raw.y - prev.y) * a }
            : raw;
        smThumb.current = lp(smThumb.current, rawThumb);
        smIndex.current = lp(smIndex.current, rawIndex);
        const thumbX = smThumb.current.x;
        const thumbY = smThumb.current.y;
        const indexX = smIndex.current.x;
        const indexY = smIndex.current.y;
        const mx = (thumbX + indexX) / 2;
        const my = (thumbY + indexY) / 2;

        // --- FREE / LOCKED state machine ---
        // FREE: pinch selects the two touched cubes (preview). Hold still a
        //       moment → lock the whole face. LOCKED: turning the face; move the
        //       hand far from the camera (hand gets small) → unlock.
        if (!pinching) {
          lockState.current = "free";
          stillSince.current = 0;
        } else if (lockState.current === "free") {
          // detect "still" — pinch midpoint barely moving
          const pm = prevMid.current;
          const moved = pm ? Math.hypot(mx - pm.x, my - pm.y) : 1;
          if (moved < 0.012) {
            if (stillSince.current === 0) stillSince.current = now;
            else if (now - stillSince.current > 420) {
              // LOCK: remember the hand size so shrinking it later unlocks
              lockState.current = "locked";
              lockSpan.current = handSpan;
              lockTwistStart.current = { x: mx, y: my };
            }
          } else {
            stillSince.current = 0;
          }
        } else {
          // LOCKED — unlock when hand shrinks clearly (moved far from camera)
          if (handSpan < lockSpan.current * 0.7) {
            lockState.current = "free";
            stillSince.current = 0;
            lockTwistStart.current = null;
          }
        }
        prevMid.current = { x: mx, y: my };
        const locked = lockState.current === "locked";

        cbRef.current.onFrame?.({
          present: true,
          x: cx,
          y: cy,
          landmarks: pts.map((p) => ({ x: p.x, y: p.y })),
          pinching,
          locked,
          pinchX: mx,
          pinchY: my,
          thumbX,
          thumbY,
          indexX,
          indexY,
          fps,
        });

        if (locked) {
          // face is locked: track drag from the lock start; commit a turn once
          // the drag is long enough, then re-arm from the new position.
          prevPalm.current = null;
          const s = lockTwistStart.current;
          if (s) {
            const dx = mx - s.x;
            const dy = my - s.y;
            if (Math.hypot(dx, dy) > 0.06 && now - lastTwist.current > 500) {
              lastTwist.current = now;
              cbRef.current.onFingerTwist?.({
                startX: s.x,
                startY: s.y,
                dx,
                dy,
              });
              lockTwistStart.current = { x: mx, y: my }; // re-arm
            }
          }
        } else if (pinching) {
          // FREE + pinching: just previewing the two touched cubes, no turn yet
          prevPalm.current = null;
        } else {
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
        pinchState.current = false;
        lockState.current = "free";
        stillSince.current = 0;
        lockTwistStart.current = null;
        prevMid.current = null;
        smThumb.current = null;
        smIndex.current = null;
        cbRef.current.onFrame?.({
          present: false,
          x: 0.5,
          y: 0.5,
          landmarks: [],
          pinching: false,
          locked: false,
          pinchX: 0.5,
          pinchY: 0.5,
          thumbX: 0.5,
          thumbY: 0.5,
          indexX: 0.5,
          indexY: 0.5,
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
