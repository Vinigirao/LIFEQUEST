"use client";

import { useState, useTransition } from "react";
import { updateMealTime } from "./actions";

/** Horário editável direto na lista. */
export function MealTime({ id, value }: { id: string; value: string | null }) {
  const [time, setTime] = useState(value?.slice(0, 5) ?? "");
  const [pending, start] = useTransition();
  return (
    <input
      type="time"
      value={time}
      aria-label="Horário da refeição"
      onChange={(e) => setTime(e.target.value)}
      onBlur={() => {
        if (time && time !== value?.slice(0, 5)) start(() => updateMealTime(id, time));
      }}
      className={`w-[4.5rem] rounded-md bg-card-2 px-1.5 py-1 text-center text-xs tabular-nums text-muted ${pending ? "opacity-50" : ""}`}
    />
  );
}
