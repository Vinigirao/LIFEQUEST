"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createPhotoUpload, saveBodyLog } from "./actions";

/** Reduz a foto para no máximo 1280 px e JPEG ~82% (fica em torno de 150-300 KB). */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao comprimir"))), "image/jpeg", 0.82),
  );
}

export function BodyLogForm({
  date,
  current,
}: {
  date: string;
  current: { weight: string; waist: string; notes: string; photoUrl: string | null };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(current.photoUrl);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function onFile(f: File | null) {
    setFile(f);
    setSaved(false);
    if (f) setPreview(URL.createObjectURL(f));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        let photoPath: string | null = null;
        if (file) {
          const blob = await compress(file);
          const { path, token } = await createPhotoUpload(date);
          const { error: upErr } = await createClient()
            .storage.from("body-photos")
            .uploadToSignedUrl(path, token, blob, { contentType: "image/jpeg" });
          if (upErr) throw new Error(upErr.message);
          photoPath = path;
        }
        await saveBodyLog({
          date,
          weight: String(fd.get("weight") ?? ""),
          waist: String(fd.get("waist") ?? ""),
          notes: String(fd.get("notes") ?? ""),
          photoPath,
        });
        setFile(null);
        setSaved(true);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <label className="relative flex aspect-[3/4] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-card-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto do dia" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted">
            <Camera size={28} /> Toque para tirar ou escolher a foto
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {preview && <p className="-mt-1 text-center text-xs text-muted">Toque na foto para trocar</p>}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Peso (kg)</label>
          <input name="weight" inputMode="decimal" defaultValue={current.weight} className="input" />
        </div>
        <div>
          <label className="label">Cintura (cm)</label>
          <input name="waist" inputMode="decimal" defaultValue={current.waist} className="input" />
        </div>
      </div>
      <input name="notes" defaultValue={current.notes} className="input" placeholder="Observação (opcional)" />

      {error && <p className="text-sm text-bad">{error}</p>}
      {saved && <p className="text-sm text-ok">Salvo.</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Enviando..." : "Salvar"}
      </button>
    </form>
  );
}
