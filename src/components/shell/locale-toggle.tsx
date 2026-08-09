"use client";

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "@/i18n";
import { getLocalePreference } from "@/lib/i18n/preference";

// Compact FUI-styled locale toggle. Cycles en-US → zh-CN → system.
const ORDER = ["en-US", "zh-CN", "system"] as const;

export function LocaleToggle() {
  const { i18n } = useTranslation();

  const current = getLocalePreference();
  const label =
    current === "zh-CN" ? "中" : current === "en-US" ? "EN" : "SYS";

  const cycle = () => {
    const idx = ORDER.indexOf(current as (typeof ORDER)[number]);
    const next = ORDER[(idx + 1) % ORDER.length];
    void changeLocale(next);
  };

  void i18n;

  return (
    <button
      data-el="locale-toggle"
      onClick={cycle}
      className="fui-chip fui-mono flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
    >
      <Languages className="h-3.5 w-3.5 text-secondary" />
      {label}
    </button>
  );
}
