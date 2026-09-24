"use client";

import { useState, useTransition } from "react";
import { setupStravaWebhook } from "./actions";

export function WebhookButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await setupStravaWebhook()))}>
        {pending ? "Verificando..." : "Ativar webhook"}
      </button>
      {msg && <p className="mt-2 text-xs break-all text-muted">{msg}</p>}
    </div>
  );
}
