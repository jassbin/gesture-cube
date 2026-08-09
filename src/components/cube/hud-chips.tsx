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
}: {
  time: string;
  moves: number;
  frame: HandFrame | null;
  mode: "gesture" | "touch";
}) {
  const { t } = useTranslation();
  const handOn = !!frame?.present;

  return (
    <>
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
