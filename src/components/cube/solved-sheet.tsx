"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PartyPopper, Trophy } from "lucide-react";
import { useEazo } from "@eazo/sdk/react";
import { auth } from "@eazo/sdk";
import { formatTime } from "@/lib/cube/format";
import { createRecord } from "@/lib/api/records";
import type { SolveResult } from "@/lib/cube/use-cube-game";
import { cn } from "@/utils/utils";

export function SolvedSheet({
  result,
  mode,
  locale,
  onPlayAgain,
}: {
  result: SolveResult | null;
  mode: "gesture" | "touch";
  locale: string;
  onPlayAgain: () => void;
}) {
  const { t } = useTranslation();
  const user = useEazo((s) => s.auth.user);
  const [saving, setSaving] = useState(false);
  const savedFor = useRef<SolveResult | null>(null);

  useEffect(() => {
    if (!result || !user || savedFor.current === result) return;
    savedFor.current = result;
    setSaving(true);
    createRecord({ timeMs: result.timeMs, moves: result.moves, mode })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [result, user, mode]);

  if (!result) return null;

  return (
    <div
      data-el="solved-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
    >
      <div
        className="fui-chip mb-4 w-[calc(100%-24px)] max-w-sm rounded-2xl p-6 text-white"
        style={{ marginBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-2 text-secondary">
          <PartyPopper className="h-5 w-5" />
          <h2 className="text-lg font-bold">{t("play.solvedTitle")}</h2>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label={t("play.solvedTime")} value={formatTime(result.timeMs, locale)} />
          <Stat label={t("play.solvedMoves")} value={String(result.moves)} />
        </div>

        {!user && (
          <p className="mt-4 text-xs text-white/70">{t("play.signInToSave")}</p>
        )}
        {saving && (
          <p className="mt-4 fui-mono text-xs text-accent">{t("play.saving")}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            data-el="btn-play-again"
            onClick={onPlayAgain}
            className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground fui-glow-orange active:scale-95"
          >
            {t("play.playAgain")}
          </button>
          {user ? (
            <Link
              data-el="btn-view-records"
              href="/records"
              className="flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-3 text-sm font-semibold text-white"
            >
              <Trophy className="h-4 w-4" />
              {t("play.viewRecords")}
            </Link>
          ) : (
            <button
              onClick={() => auth.login().catch(() => {})}
              className="rounded-full border border-white/25 px-4 py-3 text-sm font-semibold text-white"
            >
              {t("common.signIn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/15 bg-white/5 p-3 text-center",
        className,
      )}
    >
      <div className="fui-mono text-[10px] uppercase tracking-widest text-white/55">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
