import Link from "next/link";
import { ChevronRight, ThumbsDown, ThumbsUp } from "lucide-react";
import { CompareBars } from "@/components/viz/charts";
import { LEVEL_TEXT, type Finding, type Level } from "@/lib/insights/discover";

export function LevelChip({ level }: { level: Level }) {
  const dots = level === "forte" ? 3 : level === "boa" ? 2 : level === "pista" ? 1 : 0;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card-2 px-2 py-0.5 text-[10px] font-medium text-muted" title="Quanto dá para confiar">
      <span className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: i < dots ? "var(--color-accent)" : "var(--color-line)" }} />
        ))}
      </span>
      {LEVEL_TEXT[level]}
    </span>
  );
}

export function ImpactTag({ f }: { f: Finding }) {
  const b = f.y.better ?? 0;
  if (!b) return null;
  const good = b * f.effect > 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${good ? "text-ok" : "text-bad"}`}>
      {good ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
      {good ? "ajuda" : "atrapalha"}
    </span>
  );
}

export function FindingCard({ f, href }: { f: Finding; href: string }) {
  return (
    <div className="card">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <LevelChip level={f.level} />
        <ImpactTag f={f} />
      </div>
      <p className="font-semibold leading-snug">{f.headline}.</p>
      <p className="mt-2 mb-1.5 text-[11px] text-muted">
        {f.question} · média de {f.y.label.toLowerCase()}
      </p>
      <CompareBars
        rows={[
          { label: f.hi.label, value: f.hi.mean, display: f.y.fmt(f.hi.mean), n: f.hi.n, strong: true },
          { label: f.lo.label, value: f.lo.mean, display: f.y.fmt(f.lo.mean), n: f.lo.n },
        ]}
      />
      <Link href={href} className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          {f.n} dias analisados{f.lag ? " · efeito no dia seguinte" : ""}
        </span>
        <span className="inline-flex items-center text-accent">
          ver gráfico <ChevronRight size={14} />
        </span>
      </Link>
    </div>
  );
}
