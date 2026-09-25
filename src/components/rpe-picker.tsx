"use client";

import { useOptimistic, useTransition } from "react";
import { setRpe } from "@/lib/actions/rpe";
import { RPE_OPTIONS, rpeOption } from "@/lib/rpe";

/** "Reação" de esforço: toque na carinha que resume o treino. Tocar de novo na mesma apaga. */
export function RpePicker({
  kind,
  id,
  value,
  compact = false,
}: {
  kind: "workout" | "cardio";
  id: string;
  value: number | null;
  compact?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, start] = useTransition();
  const current = rpeOption(optimistic);

  function choose(v: number) {
    const next = current?.value === v ? null : v;
    start(async () => {
      setOptimistic(next);
      await setRpe(kind, id, next);
    });
  }

  return (
    <div>
      {!compact && (
        <p className="label">
          Esforço percebido{current ? `: ${current.label} (${current.value}/10)` : ""}
        </p>
      )}
      <div className={`flex ${compact ? "gap-1" : "gap-2"}`}>
        {RPE_OPTIONS.map((o) => {
          const active = current?.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              aria-label={`${o.label} (${o.value} de 10)`}
              aria-pressed={active}
              className={`flex items-center justify-center rounded-full border transition ${
                compact ? "h-8 w-8 text-base" : "h-11 flex-1 text-xl"
              } ${active ? "border-accent bg-accent/20 scale-105" : "border-line bg-card-2 opacity-60 hover:opacity-100"}`}
            >
              {o.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
