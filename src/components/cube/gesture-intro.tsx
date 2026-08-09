"use client";

import { useTranslation } from "react-i18next";
import { Smartphone, Hand, Camera, Compass, RotateCw } from "lucide-react";

/**
 * One-time onboarding card shown BEFORE the gesture camera starts.
 * Consolidates every "how to play" hint in one place at the very beginning:
 *  1. hold the phone so the cube is between you and the phone (hand behind it)
 *  2. control with thumb + index pinch; move nearer/farther to pick a layer;
 *     hold still to lock the face; turn your fingers to twist it
 *  3. it needs two permissions: camera + motion (gyro)
 */
export function GestureIntro({
  onStart,
  onCancel,
}: {
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const steps = [
    { icon: Smartphone, key: "hold" },
    { icon: Hand, key: "pinch" },
    { icon: RotateCw, key: "depth" },
  ] as const;

  return (
    <div
      data-el="gesture-intro"
      className="absolute inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(6,12,40,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="fui-chip w-full max-w-sm rounded-3xl p-6"
        style={{
          boxShadow:
            "0 0 0 1px rgba(0,255,136,0.35), 0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        <p className="fui-mono text-[10px] uppercase tracking-[0.3em] text-accent/80">
          {t("play.intro.kicker")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-white">
          {t("play.intro.title")}
        </h2>

        <ul className="mt-5 flex flex-col gap-4">
          {steps.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "rgba(0,255,136,0.12)" }}
              >
                <Icon className="h-4.5 w-4.5 text-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {t(`play.intro.${key}.title`)}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-secondary/90">
                  {t(`play.intro.${key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* permissions notice */}
        <div
          className="mt-5 flex items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <Camera className="h-4 w-4 shrink-0 text-secondary" />
          <Compass className="h-4 w-4 shrink-0 text-secondary" />
          <p className="text-[11px] leading-snug text-secondary/90">
            {t("play.intro.perms")}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            data-el="intro-start"
            onClick={onStart}
            className="fui-chip w-full rounded-full py-3 text-sm font-bold text-accent"
            style={{ boxShadow: "0 0 0 1px rgba(0,255,136,0.5)" }}
          >
            {t("play.intro.start")}
          </button>
          <button
            data-el="intro-cancel"
            onClick={onCancel}
            className="w-full rounded-full py-2 text-xs font-medium text-secondary/80"
          >
            {t("play.intro.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
