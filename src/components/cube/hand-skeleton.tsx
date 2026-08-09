"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/lib/cube/use-hands";

// MediaPipe hand connection pairs (subset for a clean skeleton).
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

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
    // mirror x so hand feels natural on-screen
    const px = (p: { x: number }) => (1 - p.x) * W;
    const py = (p: { y: number }) => p.y * H;

    ctx.strokeStyle = "rgba(0,255,136,0.95)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,255,136,0.9)";
    ctx.shadowBlur = 22;
    CONNECTIONS.forEach(([a, b]) => {
      const pa = frame.landmarks[a];
      const pb = frame.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(px(pa), py(pa));
      ctx.lineTo(px(pb), py(pb));
      ctx.stroke();
    });
    // Fingertip landmarks drawn larger so the hand reads bigger / more present.
    const TIPS = new Set([4, 8, 12, 16, 20]);
    ctx.fillStyle = "#00FF88";
    frame.landmarks.forEach((p, i) => {
      const r = TIPS.has(i) ? 22 : 16;
      ctx.beginPath();
      ctx.arc(px(p), py(p), r, 0, Math.PI * 2);
      ctx.fill();
    });
    // bright white cores on fingertips for a stronger joint look
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    frame.landmarks.forEach((p, i) => {
      if (!TIPS.has(i)) return;
      ctx.beginPath();
      ctx.arc(px(p), py(p), 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // pinch highlight: connect thumb (4) and index (8) tips + glow the grab point
    if (frame.pinching && frame.landmarks.length >= 21) {
      const thumb = frame.landmarks[4];
      const index = frame.landmarks[8];
      const gx = (px(thumb) + px(index)) / 2;
      const gy = (py(thumb) + py(index)) / 2;
      ctx.strokeStyle = "rgba(255,176,32,0.95)";
      ctx.lineWidth = 12;
      ctx.shadowColor = "rgba(255,176,32,0.95)";
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.moveTo(px(thumb), py(thumb));
      ctx.lineTo(px(index), py(index));
      ctx.stroke();
      ctx.fillStyle = "rgba(255,176,32,0.9)";
      ctx.beginPath();
      ctx.arc(gx, gy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(gx, gy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frame]);

  return (
    <canvas
      ref={ref}
      data-el="hand-skeleton"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
