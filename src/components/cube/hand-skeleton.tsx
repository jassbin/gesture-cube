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

    ctx.strokeStyle = "rgba(0,255,136,0.9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,255,136,0.8)";
    ctx.shadowBlur = 8;
    CONNECTIONS.forEach(([a, b]) => {
      const pa = frame.landmarks[a];
      const pb = frame.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(px(pa), py(pa));
      ctx.lineTo(px(pb), py(pb));
      ctx.stroke();
    });
    ctx.fillStyle = "#00FF88";
    frame.landmarks.forEach((p) => {
      ctx.beginPath();
      ctx.arc(px(p), py(p), 3, 0, Math.PI * 2);
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
