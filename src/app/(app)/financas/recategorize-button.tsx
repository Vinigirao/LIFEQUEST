"use client";

import { useState, useTransition } from "react";
import { recategorizeUncategorized } from "./actions";

export function RecategorizeButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="text-xs text-accent"
        disabled={pending}
        onClick={() => start(async () => setMsg(`${await recategorizeUncategorized()} categorizado(s)`))}
      >
        {pending ? "aplicando..." : "reaplicar regras"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
