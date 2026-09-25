import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { DateNav, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { formatDayShort, safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { DayScale } from "@/components/day-scale";
import { ENERGY_EMOJI, MOOD_EMOJI } from "@/lib/mood";
import { saveJournal } from "./actions";

type Entry = { entry_date: string; content: string; mood: number | null; energy: number | null };

export default async function DiarioPage({ searchParams }: PageProps<"/diario">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const date = safeDate(typeof sp.d === "string" ? sp.d : undefined);

  const [{ data: entry }, { data: recent }] = await Promise.all([
    supabase.from("journal_entries").select("entry_date, content, mood, energy").eq("entry_date", date).maybeSingle(),
    supabase
      .from("journal_entries")
      .select("entry_date, content, mood, energy")
      .neq("entry_date", date)
      .order("entry_date", { ascending: false })
      .limit(20),
  ]);
  const e = entry as Entry | null;

  return (
    <>
      <PageTitle title="Diário" subtitle="Como foi o dia?" />
      <DateNav basePath="/diario" date={date} />

      <div className="card mb-3 space-y-3">
        <div>
          <p className="label">Humor</p>
          <DayScale key={`m-${date}`} field="mood" value={e?.mood ?? null} date={date} />
        </div>
        <div>
          <p className="label">Energia</p>
          <DayScale key={`e-${date}`} field="energy" value={e?.energy ?? null} date={date} />
        </div>
      </div>

      {/* key força o formulário a recarregar os valores ao trocar de dia */}
      <form key={date} action={saveJournal} className="card space-y-4">
        <input type="hidden" name="date" value={date} />
        <textarea
          name="content"
          className="input"
          rows={8}
          defaultValue={e?.content ?? ""}
          placeholder="O que aconteceu hoje, o que pensou, o que aprendeu..."
        />
        <SubmitButton>Salvar texto</SubmitButton>
      </form>

      <SectionTitle>Últimos dias</SectionTitle>
      {(recent ?? []).length === 0 ? (
        <Empty>Nenhuma entrada anterior ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {(recent as Entry[]).map((r) => (
            <li key={r.entry_date}>
              <Link href={`/diario?d=${r.entry_date}`} className="card block">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="first-letter:uppercase inline-block">{formatDayShort(r.entry_date)}</span>
                  <span>
                    {r.mood ? MOOD_EMOJI[r.mood - 1] : ""}
                    {r.energy ? ` ${ENERGY_EMOJI[r.energy - 1]}` : ""}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{r.content || "(sem texto)"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
