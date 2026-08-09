"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/lib/cube/use-hands";

// We intentionally DON'T draw the hand skeleton. Only the two touch points
// (thumb tip + index tip) are shown — those are the fingers that grab a face.
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
    // rear camera → no mirror
    const px = (p: { x: number }) => p.x * W;
    const py = (p: { y: number }) => p.y * H;

    const thumb = frame.landmarks[4];
    const index = frame.landmarks[8];
    const active = frame.pinching;
    const color = frame.locked
      ? "255,176,32"
      : active
        ? "255,213,74"
        : "0,255,136";

    // draw the two touch points only
    [thumb, index].forEach((p) => {
      const x = px(p);
      const y = py(p);
      ctx.shadowColor = `rgba(${color},0.9)`;
      ctx.shadowBlur = active ? 30 : 20;
      ctx.fillStyle = `rgba(${color},0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, active ? 26 : 20, 0, Math.PI * 2);
      ctx.fill();
      // bright white core
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
