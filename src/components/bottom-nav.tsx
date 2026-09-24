"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Camera, Dumbbell, Footprints, Target, UtensilsCrossed } from "lucide-react";

const TABS = [
  { href: "/", label: "Metas", icon: Target },
  { href: "/diario", label: "Diário", icon: BookOpen },
  { href: "/lembretes", label: "Lembretes", icon: Bell },
  { href: "/treino", label: "Treino", icon: Dumbbell },
  { href: "/cardio", label: "Cardio", icon: Footprints },
  { href: "/dieta", label: "Dieta", icon: UtensilsCrossed },
  { href: "/fotos", label: "Fotos", icon: Camera },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${
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
