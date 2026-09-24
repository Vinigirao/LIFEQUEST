import { Pause, Play, Send, Trash2 } from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";
import { formatDateTime, todayISO } from "@/lib/dates";
import { describeSchedule, type ReminderSchedule } from "@/lib/schedule";
import { requireUser } from "@/lib/supabase/server";
import { deleteReminder, testReminder, toggleReminder } from "./actions";
import { PushManager } from "./push-manager";
import { ReminderForm } from "./reminder-form";

type Reminder = ReminderSchedule & {
  id: string;
  title: string;
  body: string | null;
  active: boolean;
  next_run_at: string | null;
};

export default async function LembretesPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .order("active", { ascending: false })
    .order("next_run_at", { ascending: true, nullsFirst: false });
  const reminders = (data ?? []) as Reminder[];

  return (
    <>
      <PageTitle title="Lembretes" subtitle="Notificações no horário de São Paulo" />
      <PushManager />

      <SectionTitle>Seus lembretes</SectionTitle>
      {reminders.length === 0 ? (
        <Empty>Nenhum lembrete ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r) => (
            <li key={r.id} className={`card ${r.active ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.title}</p>
                  {r.body && <p className="truncate text-sm text-muted">{r.body}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {r.schedule_type === "once" && r.run_at ? formatDateTime(r.run_at) : describeSchedule(r)}
                    {r.active && r.next_run_at ? ` · próximo: ${formatDateTime(r.next_run_at)}` : ""}
                    {!r.active ? " · pausado" : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <form action={toggleReminder}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton className="btn btn-sm" pendingText="...">
                    {r.active ? <Pause size={14} /> : <Play size={14} />} {r.active ? "Pausar" : "Ativar"}
                  </SubmitButton>
                </form>
                <form action={testReminder}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton className="btn btn-sm" pendingText="...">
                    <Send size={14} /> Testar
                  </SubmitButton>
                </form>
                <form action={deleteReminder} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <DeleteButton>
                    <Trash2 size={14} />
                  </DeleteButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Novo lembrete</SectionTitle>
      <ReminderForm today={todayISO()} />
    </>
  );
}
