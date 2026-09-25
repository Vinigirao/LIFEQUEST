"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Dumbbell, Home, LayoutGrid, UtensilsCrossed } from "lucide-react";

const TABS = [
  { href: "/", label: "Início", icon: Home, match: ["/"] },
  { href: "/treino", label: "Treino", icon: Dumbbell, match: ["/treino", "/cardio"] },
  { href: "/dieta", label: "Dieta", icon: UtensilsCrossed, match: ["/dieta"] },
  { href: "/analises", label: "Análises", icon: BarChart3, match: ["/analises"] },
  {
    href: "/mais",
    label: "Mais",
    icon: LayoutGrid,
    match: ["/mais", "/diario", "/lembretes", "/fotos", "/financas", "/metas", "/config"],
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m)));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
