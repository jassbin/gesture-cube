"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GyroStatus = "idle" | "need-permission" | "active" | "unsupported";

type Handler = (nx: number, ny: number) => void;

function detectInitialStatus(): GyroStatus {
  if (typeof window === "undefined") return "idle";
  const DOE = window.DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<string>;
      })
    | undefined;
  if (!DOE) return "unsupported";
  if (typeof DOE.requestPermission === "function") return "need-permission";
  return "active"; // android / desktop-with-sensors: attach directly
}

// Reads device orientation → normalized (-1..1) parallax offsets.
// Falls back to pointer/mouse movement on desktop.
export function useGyroParallax(onChange: Handler) {
  const [status, setStatus] = useState<GyroStatus>(detectInitialStatus);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const base = useRef<{ beta: number; gamma: number } | null>(null);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;
    if (!base.current) base.current = { beta, gamma };
    const db = beta - base.current.beta;
    const dg = gamma - base.current.gamma;
    // Map a smaller tilt range to full parallax → tilting feels more responsive.
    const ny = Math.max(-1, Math.min(1, db / 22));
    const nx = Math.max(-1, Math.min(1, dg / 22));
    cb.current(nx, ny);
    setStatus((s) => (s === "active" ? s : "active"));
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    if (!DOE) {
      setStatus("unsupported");
      return;
    }
    const attach = () => {
      base.current = null;
      window.addEventListener("deviceorientation", handleOrientation, true);
      setStatus("active");
    };
    if (typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((res) => (res === "granted" ? attach() : setStatus("unsupported")))
        .catch(() => setStatus("unsupported"));
    } else {
      attach();
    }
  }, [handleOrientation]);

  // Attach sensors / pointer fallback after mount (no setState needed here for
  // the auto-attach case — initial status already reflects capability).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (DOE && typeof DOE.requestPermission !== "function") {
      base.current = null;
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      cb.current(nx, ny);
    };
    window.addEventListener("pointermove", onPointer);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [handleOrientation]);

  return { status, start };
}
