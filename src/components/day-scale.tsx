"use client";

import { useOptimistic, useTransition } from "react";
import { setDayScale } from "@/app/(app)/diario/actions";
import { ENERGY_EMOJI, MOOD_EMOJI } from "@/lib/mood";

/** Linha de 5 carinhas para humor ou energia; salva na hora. */
export function DayScale({ field, value, date }: { field: "mood" | "energy"; value: number | null; date?: string }) {
  const [current, setCurrent] = useOptimistic(value);
  const [, start] = useTransition();
  const emojis = field === "mood" ? MOOD_EMOJI : ENERGY_EMOJI;
  return (
    <div className="flex gap-1.5">
      {emojis.map((e, i) => {
        const v = i + 1;
        const active = current === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={`${field === "mood" ? "Humor" : "Energia"} ${v} de 5`}
            aria-pressed={active}
            onClick={() =>
              start(async () => {
                const next = active ? null : v;
                setCurrent(next);
                await setDayScale(field, next, date);
              })
            }
            className={`flex h-10 flex-1 items-center justify-center rounded-full border text-xl transition ${
              active ? "scale-105 border-accent bg-accent/20" : "border-line bg-card-2 opacity-60"
            }`}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}
