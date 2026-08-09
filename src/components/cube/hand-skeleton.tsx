"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/lib/cube/use-hands";

type Pt = { x: number; y: number };

// Finger bone chains (MediaPipe indices) — drawn as thick rounded strokes.
const FINGERS: number[][] = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // pinky
];
// Palm polygon (wrist + finger bases) — filled to join the fingers together.
const PALM = [0, 1, 5, 9, 13, 17];

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * PALM mode (hand open, whole-cube rotation): a single translucent, human-like
 * hand — a filled palm plus five rounded fingers. Everything is composited
 * opaquely on an offscreen canvas first (so palm + fingers merge into ONE
 * connected silhouette with no internal seams), then stamped back at low alpha.
 * PINCH / LOCK mode: only the two fingertip touch points (thumb + index).
 */
export function HandSkeleton({ frame }: { frame: HandFrame | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!frame?.present || frame.landmarks.length < 21) return;

    const W = rect.width;
    const H = rect.height;
    const lm = frame.landmarks;
    const px = (p: Pt) => p.x * W;
    const py = (p: Pt) => p.y * H;

    if (frame.palm) {
      const scr: Pt[] = lm.map((p) => ({ x: px(p), y: py(p) }));
      // finger thickness scales with hand size on screen
      const handW = dist(scr[5], scr[17]) || 60;
      const thick = Math.max(18, handW * 0.42);

      // offscreen buffer at device pixels — compose the hand opaquely so the
      // palm fill and finger strokes union into one seamless shape
      let off = offRef.current;
      if (!off) {
        off = document.createElement("canvas");
        offRef.current = off;
      }
      off.width = cv.width;
      off.height = cv.height;
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);

      const green = "#00ff88";
      octx.fillStyle = green;
      octx.strokeStyle = green;
      octx.lineJoin = "round";
      octx.lineCap = "round";

      // palm (filled)
      octx.beginPath();
      PALM.forEach((i, k) => {
        const p = scr[i];
        if (k === 0) octx.moveTo(p.x, p.y);
        else octx.lineTo(p.x, p.y);
      });
      octx.closePath();
      octx.fill();

      // fingers (thick rounded strokes) + rounded fingertips
      FINGERS.forEach((chain) => {
        octx.lineWidth = thick;
        octx.beginPath();
        chain.forEach((i, k) => {
          const p = scr[i];
          if (k === 0) octx.moveTo(p.x, p.y);
          else octx.lineTo(p.x, p.y);
        });
        octx.stroke();
        const tip = scr[chain[chain.length - 1]];
        octx.beginPath();
        octx.arc(tip.x, tip.y, thick / 2, 0, Math.PI * 2);
        octx.fill();
      });

      // stamp back translucently as one connected silhouette
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.24;
      ctx.shadowColor = "rgba(0,255,136,0.5)";
      ctx.shadowBlur = 18 * dpr;
      ctx.drawImage(off, 0, 0);
      ctx.restore();
      return;
    }

    // ---- two touch points (pinch / lock mode) ----
    const active = frame.pinching;
    const color = frame.locked
      ? "255,176,32"
      : active
        ? "255,213,74"
        : "0,255,136";
    [lm[4], lm[8]].forEach((p) => {
      const x = px(p);
      const y = py(p);
      ctx.shadowColor = `rgba(${color},0.9)`;
      ctx.shadowBlur = active ? 30 : 20;
      ctx.fillStyle = `rgba(${color},0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, active ? 26 : 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, active ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [frame]);

  return (
    <canvas
      ref={ref}
      data-el="hand-skeleton"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
