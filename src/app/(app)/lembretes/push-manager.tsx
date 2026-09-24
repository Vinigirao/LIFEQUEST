"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import { removeSubscription, saveSubscription, sendTestPush } from "./actions";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function detectState(): Promise<State> {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isIOS && !standalone) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export function PushManager() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    detectState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  function enable() {
    setMsg(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        await saveSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
        setState("on");
        setMsg("Notificações ativadas neste aparelho.");
      } catch (e) {
        setMsg(`Não foi possível ativar: ${(e as Error).message}`);
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg(null);
    });
  }

  function test() {
    startTransition(async () => {
      const n = await sendTestPush();
      setMsg(n > 0 ? `Enviado para ${n} aparelho(s).` : "Nenhum aparelho inscrito.");
    });
  }

  return (
    <div className="card">
      <p className="font-semibold">Notificações neste aparelho</p>
      {state === "loading" && <p className="mt-1 text-sm text-muted">Verificando...</p>}
      {state === "install" && (
        <p className="mt-1 text-sm text-muted">
          No iPhone, primeiro adicione o app à tela de início: no Safari toque em Compartilhar → &quot;Adicionar à Tela de
          Início&quot;. Depois abra o LIFEQUEST pelo ícone e volte aqui.
        </p>
      )}
      {state === "unsupported" && <p className="mt-1 text-sm text-muted">Este navegador não suporta notificações push.</p>}
      {state === "denied" && (
        <p className="mt-1 text-sm text-muted">
          As notificações foram bloqueadas. Libere nas configurações do aparelho (Ajustes → Notificações → LIFEQUEST).
        </p>
      )}
      {state === "off" && (
        <button onClick={enable} disabled={pending} className="btn btn-primary mt-3 w-full">
          <BellRing size={16} /> {pending ? "Ativando..." : "Ativar notificações"}
        </button>
      )}
      {state === "on" && (
        <div className="mt-3 flex gap-2">
          <button onClick={test} disabled={pending} className="btn flex-1">
            <Send size={16} /> Testar
          </button>
          <button onClick={disable} disabled={pending} className="btn btn-danger flex-1">
            <BellOff size={16} /> Desativar
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
