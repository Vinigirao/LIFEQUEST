import Link from "next/link";
import { LineChart } from "@/components/line-chart";
import { DeleteButton } from "@/components/submit-button";
import { DateNav, Empty, PageTitle, SectionTitle, fmt } from "@/components/ui";
import { addDays, safeDate, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { deletePhoto } from "./actions";
import { BodyLogForm } from "./body-log-form";
import { PhotoCompare } from "./photo-compare";

type BodyLog = {
  log_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  photo_path: string | null;
  notes: string | null;
};

export default async function FotosPage({ searchParams }: PageProps<"/fotos">) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const date = safeDate(typeof sp.d === "string" ? sp.d : undefined);
  const since = addDays(todayISO(), -180);

  const { data } = await supabase
    .from("body_logs")
    .select("log_date, weight_kg, waist_cm, photo_path, notes")
    .gte("log_date", since)
    .order("log_date", { ascending: false });
  const logs = (data ?? []) as BodyLog[];
  const current = logs.find((l) => l.log_date === date) ?? null;

  // URLs temporárias (1h) para as fotos privadas
  const withPhoto = logs.filter((l) => l.photo_path).slice(0, 60);
  const urls = new Map<string, string>();
  if (withPhoto.length) {
    const { data: signed } = await supabase.storage
      .from("body-photos")
      .createSignedUrls(withPhoto.map((l) => l.photo_path!), 3600);
    (signed ?? []).forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  const photos = withPhoto
    .filter((l) => urls.has(l.photo_path!))
    .map((l) => ({ date: l.log_date, url: urls.get(l.photo_path!)!, weight: l.weight_kg == null ? null : Number(l.weight_kg) }));

  const target30 = addDays(photos[0]?.date ?? todayISO(), -30);
  const defaultBefore =
    [...photos].sort(
      (a, b) => Math.abs(Date.parse(a.date) - Date.parse(target30)) - Math.abs(Date.parse(b.date) - Date.parse(target30)),
    )[0]?.date ?? "";

  const weights = logs
    .filter((l) => l.weight_kg != null)
    .map((l) => ({ date: l.log_date, value: Number(l.weight_kg) }))
    .reverse();
  const waists = logs
    .filter((l) => l.waist_cm != null)
    .map((l) => ({ date: l.log_date, value: Number(l.waist_cm) }))
    .reverse();

  return (
    <>
      <PageTitle title="Fotos e medidas" subtitle="Uma foto por dia, mesma luz e mesma pose" />
      <DateNav basePath="/fotos" date={date} />

      <BodyLogForm
        key={date}
        userId={user.id}
        date={date}
        current={{
          weight: current?.weight_kg != null ? String(Number(current.weight_kg)) : "",
          waist: current?.waist_cm != null ? String(Number(current.waist_cm)) : "",
          notes: current?.notes ?? "",
          photoUrl: current?.photo_path ? (urls.get(current.photo_path) ?? null) : null,
        }}
      />
      {current?.photo_path && (
        <form action={deletePhoto} className="mt-2 text-right">
          <input type="hidden" name="date" value={date} />
          <DeleteButton className="text-xs text-bad" confirmText="Apagar a foto deste dia?">
            Apagar foto do dia
          </DeleteButton>
        </form>
      )}

      {weights.length >= 2 && (
        <>
          <SectionTitle>
            Peso · {fmt(weights[weights.length - 1].value - weights[0].value, 1)} kg no período
          </SectionTitle>
          <div className="card">
            <LineChart points={weights} unit="kg" />
          </div>
        </>
      )}
      {waists.length >= 2 && (
        <>
          <SectionTitle>Cintura</SectionTitle>
          <div className="card">
            <LineChart points={waists} unit="cm" />
          </div>
        </>
      )}

      <SectionTitle>Comparar</SectionTitle>
      {photos.length < 2 ? (
        <Empty>Com duas fotos ou mais, aparece aqui o antes e depois.</Empty>
      ) : (
        <PhotoCompare photos={photos} defaultBefore={defaultBefore} />
      )}

      {photos.length > 0 && (
        <>
          <SectionTitle>Linha do tempo</SectionTitle>
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map((p) => (
              <Link key={p.date} href={`/fotos?d=${p.date}`} className="relative aspect-[3/4] overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.date} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px]">
                  {p.date.slice(8, 10)}/{p.date.slice(5, 7)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
