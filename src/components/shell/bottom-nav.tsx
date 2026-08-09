"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/utils";

const ITEMS = [
  { href: "/", key: "nav.play", icon: Box, el: "nav-play" },
  { href: "/records", key: "nav.records", icon: Trophy, el: "nav-records" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav
      data-el="bottom-nav"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ bottom: "max(18px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="fui-chip pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
        {ITEMS.map((it) => {
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              data-el={it.el}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground fui-glow-orange"
                  : "text-white/70 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(it.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
