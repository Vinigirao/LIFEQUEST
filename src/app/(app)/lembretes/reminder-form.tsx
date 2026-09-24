"use client";

import { useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAY_LABELS } from "@/lib/schedule";
import { createReminder } from "./actions";

const TYPES = [
  { value: "daily", label: "Todo dia" },
  { value: "weekly", label: "Dias da semana" },
  { value: "once", label: "Uma vez" },
] as const;

export function ReminderForm({ today }: { today: string }) {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("daily");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await createReminder(fd);
        formRef.current?.reset();
        setType("daily");
      }}
      className="card space-y-3"
    >
      <div>
        <label className="label">Título</label>
        <input name="title" className="input" placeholder="Ex.: Tomar creatina" required />
      </div>
      <div>
        <label className="label">Mensagem (opcional)</label>
        <input name="body" className="input" placeholder="Detalhe que aparece na notificação" />
      </div>

      <div>
        <p className="label">Repetição</p>
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <label key={t.value} className="flex-1">
              <input
                type="radio"
                name="schedule_type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="peer sr-only"
              />
              <span className="chip w-full text-xs">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {type === "weekly" && (
        <div className="flex justify-between gap-1">
          {WEEKDAY_LABELS.map((d, i) => (
            <label key={d} className="flex-1">
              <input type="checkbox" name="weekdays" value={i} className="peer sr-only" defaultChecked={i >= 1 && i <= 5} />
              <span className="chip w-full min-w-0 px-0 text-xs">{d}</span>
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {type === "once" && (
          <div>
            <label className="label">Data</label>
            <input type="date" name="date" defaultValue={today} min={today} className="input" required />
          </div>
        )}
        <div className={type === "once" ? "" : "col-span-2"}>
          <label className="label">Horário</label>
          <input type="time" name="time" defaultValue="08:00" className="input" required />
        </div>
      </div>

      <SubmitButton>Criar lembrete</SubmitButton>
    </form>
  );
}
