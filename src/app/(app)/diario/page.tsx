import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { DateNav, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { formatDayShort, safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { saveJournal } from "./actions";

type Entry = { entry_date: string; content: string; mood: number | null; energy: number | null };

function Scale({ name, label, value }: { name: string; label: string; value: number | null }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex-1">
            <input type="radio" name={name} value={n} defaultChecked={value === n} className="peer sr-only" />
            <span className="chip w-full">{n}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

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
        <Scale name="mood" label="Humor (1 a 5)" value={e?.mood ?? null} />
        <Scale name="energy" label="Energia (1 a 5)" value={e?.energy ?? null} />
        <SubmitButton>Salvar</SubmitButton>
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
                    {r.mood ? `humor ${r.mood}` : ""}
                    {r.mood && r.energy ? " · " : ""}
                    {r.energy ? `energia ${r.energy}` : ""}
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
