"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/lib/cube/use-hands";

type Pt = { x: number; y: number };

// Ordered ring of landmarks that traces a hand-shaped outline: down the
// pinky side, across the fingertips, out to the thumb, then back along the
// wrist. Gives a human-like silhouette (all five fingers included).
const OUTLINE = [20, 19, 16, 12, 8, 7, 4, 3, 2, 1, 0, 17, 18];

// Draw a smooth closed curve through points (midpoint quadratics).
function smoothPath(ctx: CanvasRenderingContext2D, ring: Pt[]) {
  if (ring.length < 3) return;
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  ctx.beginPath();
  const start = mid(ring[ring.length - 1], ring[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const next = ring[(i + 1) % ring.length];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y);
  }
  ctx.closePath();
}

/**
 * Two display modes:
 *  - PALM mode (hand open, whole-cube rotation): a single translucent,
 *    human-like hand SILHOUETTE — a soft filled outline, no skeleton lines
 *    or joint dots, so it reads as a hand and isn't scary.
 *  - PINCH / LOCK mode: only the two fingertip touch points (thumb + index).
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
    const px = (p: Pt) => p.x * W;
    const py = (p: Pt) => p.y * H;

    if (frame.palm) {
      // ---- translucent human-like hand silhouette ----
      const c = "0,255,136";
      const ring: Pt[] = OUTLINE.map((i) => ({ x: px(lm[i]), y: py(lm[i]) }));
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${c},0.45)`;
      ctx.shadowBlur = 24;
      smoothPath(ctx, ring);
      ctx.fillStyle = `rgba(${c},0.16)`;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${c},0.5)`;
      ctx.lineWidth = 3;
      ctx.stroke();
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
