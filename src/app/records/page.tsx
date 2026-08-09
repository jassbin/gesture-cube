"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Trophy, Hand, Pointer, ChevronRight } from "lucide-react";
import { useEazo } from "@eazo/sdk/react";
import { auth } from "@eazo/sdk";
import { fetchRecords, type SolveRecord } from "@/lib/api/records";
import { formatTime, bestRecord } from "@/lib/cube/format";
import { BottomNav } from "@/components/shell/bottom-nav";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { UserBadge } from "@/components/user-profile/user-badge";
import { cn } from "@/utils/utils";

export default function RecordsPage() {
  const { t, i18n } = useTranslation();
  const user = useEazo((s) => s.auth.user);
  const authLoading = useEazo((s) => s.auth.loading);
  const [records, setRecords] = useState<SolveRecord[] | null>(null);

  const load = useCallback(() => {
    fetchRecords()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  useEffect(() => {
    if (user) load();
    else setRecords([]);
  }, [user, load]);

  const sorted = useMemo(
    () =>
      [...(records ?? [])].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [records],
  );
  const best = bestRecord(records ?? []);

  return (
    <main className="fui-broadcast-field relative min-h-dvh w-full overflow-hidden pb-28">
      <div className="fui-dot-grid pointer-events-none absolute inset-0 opacity-50" />

      <header
        className="relative z-10 flex items-center justify-between px-4"
        style={{ paddingTop: "max(56px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-2 text-white">
          <Trophy className="h-5 w-5 text-secondary" />
          <div>
            <h1 className="text-lg font-bold leading-tight">
              {t("records.title")}
            </h1>
            <p className="text-xs text-white/60">{t("records.subtitle")}</p>
          </div>
        </div>
        <LocaleToggle />
      </header>

      <div className="relative z-10 mt-3 px-4">
        <UserBadge />
      </div>

      {!authLoading && !user && (
        <section className="relative z-10 mx-4 mt-6">
          <div className="fui-chip rounded-2xl p-8 text-center text-white/80">
            <p>{t("records.signInPrompt")}</p>
            <button
              data-el="records-sign-in"
              onClick={() => auth.login().catch(() => {})}
              className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground fui-glow-orange"
            >
              {t("common.signIn")}
            </button>
          </div>
        </section>
      )}

      {user && (
        <>
          {records === null && (
            <div className="relative z-10 mt-6 space-y-2 px-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="fui-chip h-16 animate-pulse rounded-xl opacity-60"
                />
              ))}
            </div>
          )}

          {best && (
            <section
              data-el="records-best"
              className="fui-chip relative z-10 mx-4 mt-4 flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <div className="fui-mono text-[10px] uppercase tracking-widest text-secondary">
                  {t("records.best")}
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-white">
                  {formatTime(best.timeMs, i18n.language)}
                </div>
              </div>
              <div className="text-right text-sm font-semibold text-white/70">
                {best.moves} {t("records.moves")}
              </div>
            </section>
          )}

          <section className="relative z-10 mt-4 space-y-2 px-4">
            {records !== null && sorted.length === 0 && (
              <div className="fui-chip rounded-2xl p-8 text-center text-white/70">
                <p>{t("records.empty")}</p>
                <Link
                  href="/"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  {t("records.goPlay")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            )}
            {sorted.map((r) => (
              <article
                key={r.id}
                data-el="record-item"
                className="fui-chip flex items-center justify-between rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      r.mode === "gesture"
                        ? "bg-accent/20 text-accent"
                        : "bg-secondary/20 text-secondary",
                    )}
                  >
                    {r.mode === "gesture" ? (
                      <Hand className="h-4 w-4" />
                    ) : (
                      <Pointer className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <div className="text-lg font-bold tabular-nums text-white">
                      {formatTime(r.timeMs, i18n.language)}
                    </div>
                    <div className="fui-mono text-[10px] uppercase tracking-wider text-white/50">
                      {r.moves} {t("records.moves")} ·{" "}
                      {r.mode === "gesture"
                        ? t("records.gesture")
                        : t("records.touch")}
                    </div>
                  </div>
                </div>
                <time className="text-xs text-white/45">
                  {new Date(r.createdAt).toLocaleDateString(i18n.language, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </article>
            ))}
          </section>
        </>
      )}

      <BottomNav />
    </main>
  );
}
