"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/utils/utils";
import type { HandFrame } from "@/lib/cube/use-hands";

function Chip({
  label,
  value,
  className,
  el,
}: {
  label: string;
  value: string;
  className?: string;
  el?: string;
}) {
  return (
    <div
      data-el={el}
      className={cn(
        "fui-chip fui-mono rounded-lg px-2.5 py-1.5 text-white",
        className,
      )}
    >
      <div className="text-[9px] uppercase tracking-widest text-white/55">
        {label}
      </div>
      <div className="text-sm font-semibold leading-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function HudChips({
  time,
  moves,
  frame,
  mode,
  gestureFlash,
}: {
  time: string;
  moves: number;
  frame: HandFrame | null;
  mode: "gesture" | "touch";
  gestureFlash?: { id: number; kind: "rotate" | "twist" } | null;
}) {
  const { t } = useTranslation();
  const handOn = !!frame?.present;

  return (
    <>
      {/* prominent gesture status banner — only in gesture mode */}
      {mode === "gesture" && (
        <div
          data-el="hud-gesture-banner"
          className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2"
          style={{ top: "max(100px, calc(env(safe-area-inset-top, 0px) + 44px))" }}
        >
          <div
            className={cn(
              "fui-chip flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
              handOn
                ? "text-accent fui-status-pulse"
                : "text-white/70",
            )}
            style={
              handOn
                ? { boxShadow: "0 0 0 1px rgba(0,255,136,0.55), 0 6px 26px rgba(0,255,136,0.32)" }
                : undefined
            }
          >
            {handOn ? (
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span className="absolute inset-0 rounded-full border-2 border-accent/40 border-t-accent fui-track-ring" />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  style={{ boxShadow: "0 0 8px 2px rgba(0,255,136,0.9)" }}
                />
              </span>
            ) : (
              <span className="h-3 w-3 rounded-full bg-white/40" />
            )}
            {handOn
              ? t("play.hud.handReadyBanner")
              : t("play.hud.handNoneBanner")}
          </div>
        </div>
      )}

      {/* gesture-fired flash — big, unmissable, transient */}
      {mode === "gesture" && gestureFlash && (
        <div
          key={gestureFlash.id}
          data-el="hud-gesture-flash"
          className="pointer-events-none absolute inset-x-0 top-[30%] z-40 flex justify-center"
        >
          <div className="fui-flash-pop fui-chip rounded-2xl px-6 py-3 text-2xl font-bold text-accent"
            style={{ boxShadow: "0 0 0 1px rgba(0,255,136,0.5), 0 10px 40px rgba(0,255,136,0.4)" }}
          >
            {gestureFlash.kind === "twist"
              ? t("play.hud.flashTwist")
              : t("play.hud.flashRotate")}
          </div>
        </div>
      )}

      {/* top-left cluster */}
      <div
        data-el="hud-top-left"
        className="pointer-events-none absolute left-3 z-30 flex flex-col gap-2"
        style={{ top: "max(56px, env(safe-area-inset-top, 0px))" }}
      >
        <Chip el="hud-time" label={t("play.hud.time")} value={time} />
        <Chip
          el="hud-moves"
          label={t("play.hud.moves")}
          value={String(moves)}
        />
      </div>

      {/* top-right cluster */}
      <div
        data-el="hud-top-right"
        className="pointer-events-none absolute right-3 z-30 flex flex-col items-end gap-2"
        style={{ top: "max(56px, env(safe-area-inset-top, 0px))" }}
      >
        <div
          className={cn(
            "fui-chip fui-mono flex items-center gap-2 rounded-lg px-2.5 py-1.5",
            handOn ? "text-accent" : "text-white/60",
          )}
          data-el="hud-tracking"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              handOn ? "bg-accent" : "bg-white/40",
            )}
            style={
              handOn ? { boxShadow: "0 0 8px 2px rgba(0,255,136,0.8)" } : undefined
            }
          />
          {handOn ? t("play.hud.handReady") : t("play.hud.handNone")}
        </div>
        {mode === "gesture" && (
          <Chip
            el="hud-fps"
            label={t("play.hud.fps")}
            value={String(frame?.fps ?? 0)}
          />
        )}
      </div>

      {/* hand coordinate readout — bottom-left, only in gesture mode with a hand */}
      {mode === "gesture" && handOn && (
        <div
          data-el="hud-coord"
          className="pointer-events-none absolute left-3 z-30"
          style={{ bottom: "132px" }}
        >
          <Chip
            label={t("play.hud.coord")}
            value={`${(frame!.x).toFixed(2)}, ${(frame!.y).toFixed(2)}`}
          />
        </div>
      )}
    </>
  );
}
