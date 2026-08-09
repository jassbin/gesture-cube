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
  // true when the hand is open (palm-like): whole-cube rotation mode. In this
  // state we show a translucent hand instead of the two fingertip dots.
  palm: boolean;
  // hand size relative to the size at pinch start (>1 = closer/bigger,
  // <1 = farther/smaller). Drives "far=small=inner layer" depth selection.
  depth: number;
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
type Callbacks = {
  onFrame?: (f: HandFrame) => void;
  onSpin?: (
    dx: number,
    dy: number,
    thumbX: number,
    thumbY: number,
    indexX: number,
    indexY: number,
  ) => void;
  // Live, 1:1 finger rotation of the locked face. `delta` is the signed angle
  // (radians) the two fingers have rotated since the face was locked.
  onFingerRotate?: (delta: number) => void;
  // Fired when the locked face is released (fingers opened) — commit + snap.
  onFingerRotateEnd?: () => void;
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
  // finger angle (atan2 of index−thumb) captured when the face locks, and
  // whether a live 1:1 turn is currently in progress.
  const lockBaseAngle = useRef(0);
  const liveTurnOn = useRef(false);
  const runningRef = useRef(false);
  const frameTimes = useRef<number[]>([]);
  // hysteresis + smoothing state
  const pinchState = useRef(false);
  // consecutive frames of a firm (intentional) pinch before we commit to it,
  // so a light touch / quick brush of the two fingers does NOT grab a face.
  const pinchIntent = useRef(0);
  const smThumb = useRef<{ x: number; y: number } | null>(null);
  const smIndex = useRef<{ x: number; y: number } | null>(null);
  // FREE / LOCKED face state machine
  const lockState = useRef<"free" | "locked">("free");
  const stillSince = useRef(0);
  const prevMid = useRef<{ x: number; y: number } | null>(null);

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

        // --- pinch detection: needs a FIRM, sustained pinch (intent) ---
        // A light touch or a quick brush of the two fingers should NOT grab a
        // face — anything short of a committed pinch counts as "not pinching",
        // which drives whole-cube rotation and makes spinning easy to trigger.
        const handSpan = dist(pts[0], pts[5]) || 0.15;
        const pinchGap = dist(pts[4], pts[8]);
        const ratio = pinchGap / handSpan;
        const FIRM = 0.32; // fingers must be this close to count as a pinch
        const RELEASE = 0.6; // and this far apart to release
        const INTENT_FRAMES = 5; // must stay firm this many frames first
        if (!pinchState.current) {
          if (ratio < FIRM) pinchIntent.current += 1;
          else pinchIntent.current = 0;
          if (pinchIntent.current >= INTENT_FRAMES) pinchState.current = true;
        } else if (ratio > RELEASE) {
          pinchState.current = false;
          pinchIntent.current = 0;
        }
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
          // Pure 2D — lock once the pinch midpoint holds still for a moment.
          // The face is chosen purely by where the two fingers sit on screen.
          const pm = prevMid.current;
          const moved = pm ? Math.hypot(mx - pm.x, my - pm.y) : 1;
          if (moved < 0.02) {
            if (stillSince.current === 0) stillSince.current = now;
            else if (now - stillSince.current > 420) {
              lockState.current = "locked";
            }
          } else {
            stillSince.current = 0;
          }
        } else {
          // LOCKED — stays locked until the fingers are OPENED (pinch released,
          // handled by the !pinching branch above). Moving the hand
          // nearer/farther no longer changes the layer or breaks the lock, so
          // you can only turn this one face until you take your fingers off it.
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
          depth: 1,
          pinchX: mx,
          pinchY: my,
          thumbX,
          thumbY,
          indexX,
          indexY,
          fps,
        });

        if (locked) {
          // Face locked: rotate it 1:1 with the fingers. Capture the finger
          // angle at the moment we lock, then every frame report the signed
          // angle delta so the face tracks the fingers exactly.
          prevPalm.current = null;
          const ang = Math.atan2(indexY - thumbY, indexX - thumbX);
          if (!liveTurnOn.current) {
            liveTurnOn.current = true;
            lockBaseAngle.current = ang;
          }
          // shortest signed difference, unwrapped to (−π, π]
          let delta = ang - lockBaseAngle.current;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          cbRef.current.onFingerRotate?.(delta);
        } else if (pinching) {
          // FREE + pinching: just previewing the two touched cubes, no turn yet
          if (liveTurnOn.current) {
            liveTurnOn.current = false;
            cbRef.current.onFingerRotateEnd?.();
          }
          prevPalm.current = null;
        } else {
          // open hand → whole-cube spin from palm motion
          if (liveTurnOn.current) {
            liveTurnOn.current = false;
            cbRef.current.onFingerRotateEnd?.();
          }
          const prev = prevPalm.current;
          if (prev) {
            const sdx = cx - prev.x;
            const sdy = cy - prev.y;
            // Only spin the whole cube if the two fingertips are actually ON
            // the cube (checked by the scene via raycast) — no touch, no spin.
            cbRef.current.onSpin?.(sdx * 5.5, sdy * 5.5, thumbX, thumbY, indexX, indexY);
          }
          prevPalm.current = { x: cx, y: cy, t: now };
        }
      } else {
        prevPalm.current = null;
        if (liveTurnOn.current) {
          liveTurnOn.current = false;
          cbRef.current.onFingerRotateEnd?.();
        }
        pinchState.current = false;
        pinchIntent.current = 0;
        lockState.current = "free";
        stillSince.current = 0;
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
          depth: 1,
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
