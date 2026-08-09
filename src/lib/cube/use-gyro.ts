"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GyroStatus = "idle" | "need-permission" | "active" | "unsupported";

type Handler = (nx: number, ny: number) => void;

// Reads device orientation → normalized (-1..1) parallax offsets.
// Falls back to pointer/mouse movement on desktop.
export function useGyroParallax(onChange: Handler) {
  const [status, setStatus] = useState<GyroStatus>("idle");
  const cb = useRef(onChange);
  cb.current = onChange;
  const base = useRef<{ beta: number; gamma: number } | null>(null);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0; // front-back tilt -180..180
    const gamma = e.gamma ?? 0; // left-right -90..90
    if (!base.current) base.current = { beta, gamma };
    const db = beta - base.current.beta;
    const dg = gamma - base.current.gamma;
    // map ~30deg range to full parallax
    const ny = Math.max(-1, Math.min(1, db / 35));
    const nx = Math.max(-1, Math.min(1, dg / 35));
    cb.current(nx, ny);
    setStatus("active");
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
        .then((res) => {
          if (res === "granted") attach();
          else setStatus("unsupported");
        })
        .catch(() => setStatus("unsupported"));
    } else {
      attach();
    }
  }, [handleOrientation]);

  // Detect whether we need an explicit permission tap (iOS 13+).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (!DOE) {
      setStatus("unsupported");
    } else if (typeof DOE.requestPermission === "function") {
      setStatus("need-permission");
    } else {
      // Android / desktop-with-sensors: attach directly
      base.current = null;
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    // pointer fallback (desktop) — always attached, harmless on mobile
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
