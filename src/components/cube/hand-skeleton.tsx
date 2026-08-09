"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/lib/cube/use-hands";

// MediaPipe hand connections (finger bone chains) for the skeleton overlay.
const FINGERS: number[][] = [
  [0, 1, 2, 3, 4], // thumb
  [0, 5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [0, 17, 18, 19, 20], // pinky
];
// Palm outline (wrist + finger bases) — filled translucently in palm mode.
const PALM = [0, 5, 9, 13, 17];

/**
 * Two display modes:
 *  - PALM mode (hand open, whole-cube rotation): a translucent hand —
 *    filled palm + finger skeleton + joint dots. No fingertip target dots.
 *  - PINCH / LOCK mode: only the two fingertip touch points (thumb + index),
 *    which is how a face is grabbed and turned.
 */
export function HandSkeleton({ frame }: { frame: HandFrame | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

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
    const px = (p: { x: number }) => p.x * W;
    const py = (p: { y: number }) => p.y * H;

    if (frame.palm) {
      // ---- translucent hand (whole-cube rotation mode) ----
      const c = "0,255,136";
      // filled palm polygon
      ctx.beginPath();
      PALM.forEach((i, k) => {
        const p = lm[i];
        if (k === 0) ctx.moveTo(px(p), py(p));
        else ctx.lineTo(px(p), py(p));
      });
      ctx.closePath();
      ctx.fillStyle = `rgba(${c},0.14)`;
      ctx.fill();

      // finger bones
      ctx.strokeStyle = `rgba(${c},0.55)`;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = `rgba(${c},0.5)`;
      ctx.shadowBlur = 12;
      FINGERS.forEach((chain) => {
        ctx.beginPath();
        chain.forEach((i, k) => {
          const p = lm[i];
          if (k === 0) ctx.moveTo(px(p), py(p));
          else ctx.lineTo(px(p), py(p));
        });
        ctx.stroke();
      });

      // joints
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(${c},0.5)`;
      lm.forEach((p) => {
        ctx.beginPath();
        ctx.arc(px(p), py(p), 5, 0, Math.PI * 2);
        ctx.fill();
      });
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
