"use client";

import { useState } from "react";
import { formatDayShort } from "@/lib/dates";

type Photo = { date: string; url: string; weight: number | null };

function Side({ photos, value, onChange }: { photos: Photo[]; value: string; onChange: (d: string) => void }) {
  const p = photos.find((x) => x.date === value);
  return (
    <div className="space-y-2">
      <select className="input text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {photos.map((x) => (
          <option key={x.date} value={x.date}>
            {formatDayShort(x.date)}
          </option>
        ))}
      </select>
      <div className="aspect-[3/4] overflow-hidden rounded-xl bg-card-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p && <img src={p.url} alt={`Foto de ${p.date}`} className="h-full w-full object-cover" />}
      </div>
      <p className="text-center text-xs text-muted">{p?.weight ? `${p.weight.toLocaleString("pt-BR")} kg` : " "}</p>
    </div>
  );
}

/** Antes x depois. Padrão: foto mais próxima de 30 dias atrás x mais recente. */
export function PhotoCompare({ photos, defaultBefore }: { photos: Photo[]; defaultBefore: string }) {
  const [before, setBefore] = useState(defaultBefore);
  const [after, setAfter] = useState(photos[0]?.date ?? "");
  if (photos.length < 2) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Side photos={photos} value={before} onChange={setBefore} />
      <Side photos={photos} value={after} onChange={setAfter} />
    </div>
  );
}
