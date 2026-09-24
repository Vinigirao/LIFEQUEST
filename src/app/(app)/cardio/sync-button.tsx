"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncStrava } from "./actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncStrava();
            setMsg(r.message);
          })
        }
      >
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Sincronizando" : "Sincronizar"}
      </button>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </div>
  );
}
