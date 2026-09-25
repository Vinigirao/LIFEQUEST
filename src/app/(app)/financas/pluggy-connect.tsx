"use client";

import { useState, useTransition } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { addPluggyItem, getPluggyConnectToken, syncPluggyNow } from "./pluggy-actions";

type PluggyConnectInstance = { init: () => Promise<void> };
type PluggyConnectCtor = new (opts: {
  connectToken: string;
  includeSandbox?: boolean;
  theme?: "light" | "dark";
  language?: string;
  onSuccess?: (data: { item: { id: string } }) => void;
  onError?: (err: { message: string }) => void;
}) => PluggyConnectInstance;

const SDK = "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js";

function loadSdk(): Promise<PluggyConnectCtor> {
  const w = window as unknown as { PluggyConnect?: PluggyConnectCtor };
  if (w.PluggyConnect) return Promise.resolve(w.PluggyConnect);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK;
    s.async = true;
    s.onload = () => (w.PluggyConnect ? resolve(w.PluggyConnect) : reject(new Error("Widget da Pluggy não carregou")));
    s.onerror = () => reject(new Error("Não foi possível carregar o widget da Pluggy"));
    document.head.appendChild(s);
  });
}

/** Botões: conectar banco (widget da Pluggy → escolha "MeuPluggy"), sincronizar e colar Item ID. */
export function PluggyConnect({ hasItems }: { hasItems: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();

  function connect() {
    setMsg(null);
    start(async () => {
      const { token, error } = await getPluggyConnectToken();
      if (!token) return setMsg({ ok: false, text: error ?? "Erro ao iniciar" });
      try {
        const PluggyConnectSdk = await loadSdk();
        const widget = new PluggyConnectSdk({
          connectToken: token,
          theme: "dark",
          language: "pt",
          onSuccess: ({ item }) => {
            setMsg({ ok: true, text: "Conectado! Buscando lançamentos..." });
            start(async () => {
              const r = await addPluggyItem(item.id);
              setMsg({ ok: r.ok, text: r.message });
            });
          },
          onError: (err) => setMsg({ ok: false, text: err.message }),
        });
        await widget.init();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  }

  function sync() {
    start(async () => {
      const r = await syncPluggyNow();
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  function addManual() {
    start(async () => {
      const r = await addPluggyItem(manual);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setManual("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" onClick={connect} disabled={pending}>
          <Link2 size={16} /> Conectar banco
        </button>
        {hasItems && (
          <button className="btn" onClick={sync} disabled={pending} aria-label="Sincronizar">
            <RefreshCw size={16} className={pending ? "animate-spin" : ""} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Na lista de instituições, escolha <b>MeuPluggy</b> (não o banco direto) e autorize. Repita para cada banco.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Tenho o Item ID</summary>
        <div className="mt-2 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="input text-sm"
          />
          <button className="btn shrink-0" onClick={addManual} disabled={pending || !manual.trim()}>
            Adicionar
          </button>
        </div>
      </details>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
