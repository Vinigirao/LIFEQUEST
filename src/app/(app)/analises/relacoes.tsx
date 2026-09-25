import Link from "next/link";
import { X } from "lucide-react";
import { Empty, SectionTitle } from "@/components/ui";
import { divergingColor } from "@/components/viz/palette";
import { ScatterChart } from "@/components/viz/scatter-chart";
import { CompareBars } from "@/components/viz/charts";
import { discover, type Finding } from "@/lib/insights/discover";
import { type Ctx, num } from "./ctx";
import { FindingCard, ImpactTag, LevelChip } from "./finding-card";

const rTxt = (r: number) => (Math.abs(r) < 0.05 ? "0" : `${r > 0 ? "+" : "−"}${num(Math.abs(r), 1)}`);

function strengthWord(r: number) {
  const a = Math.abs(r);
  if (a < 0.2) return "muito fraca";
  if (a < 0.4) return "fraca";
  if (a < 0.6) return "moderada";
  return "forte";
}

function chance(p: number) {
  if (p < 0.01) return "< 1%";
  return `${num(p * 100)}%`;
}

export function Relacoes({ ctx }: { ctx: Ctx }) {
  const disc = discover(ctx.data, ctx.rows);
  const lag = ctx.sp.lag;
  const byId = new Map(disc.all.map((f) => [f.id, f]));
  const selected = ctx.sp.x && ctx.sp.y ? byId.get(`${ctx.sp.x}|${ctx.sp.y}|${ctx.sp.lag}`) : undefined;

  // matriz: linhas = fatores, colunas = resultados (só o que tem dado)
  const cols = disc.outcomes.filter((y) => disc.factors.some((x) => byId.has(`${x.key}|${y.key}|${lag}`)));
  const rowsM = disc.factors.filter((x) => cols.some((y) => byId.has(`${x.key}|${y.key}|${lag}`)));
  const list = disc.findings.filter((f) => !ctx.sp.o || f.y.key === ctx.sp.o);

  return (
    <>
      {selected && <Detail f={selected} ctx={ctx} />}

      <SectionTitle>Mapa de relações</SectionTitle>
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1 text-center text-xs font-medium">
        {([0, 1] as const).map((l) => (
          <Link
            key={l}
            href={ctx.href({ v: "relacoes", lag: String(l), o: ctx.sp.o || undefined })}
            className={`rounded-lg py-1.5 ${lag === l ? "bg-accent-strong text-white" : "text-muted"}`}
          >
            {l ? "Dia anterior → hoje" : "Mesmo dia"}
          </Link>
        ))}
      </div>
      {cols.length === 0 ? (
        <Empty>Ainda não há dias suficientes com dados cruzados. Registre dieta, humor e treinos por algumas semanas.</Empty>
      ) : (
        <div className="card overflow-x-auto px-2">
          <table className="w-full border-separate border-spacing-[2px] text-center text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card text-left text-[10px] font-normal text-muted">{lag ? "ontem ↓ · hoje →" : "fator ↓ · resultado →"}</th>
                {cols.map((y) => (
                  <th key={y.key} className="px-0.5 pb-1 align-bottom text-[10px] font-medium text-muted">
                    {y.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsM.map((x) => (
                <tr key={x.key}>
                  <th className="sticky left-0 max-w-[92px] truncate bg-card pr-1 text-left font-normal text-muted" title={x.label}>
                    {x.short}
                  </th>
                  {cols.map((y) => {
                    const f = byId.get(`${x.key}|${y.key}|${lag}`);
                    if (!f) return <td key={y.key} className="h-8 min-w-9 rounded-md bg-card-2/50 text-muted/50">·</td>;
                    const clear = f.level !== "fraca";
                    const isSel = selected?.id === f.id;
                    return (
                      <td key={y.key} className="h-8 min-w-9 p-0">
                        <Link
                          href={`${ctx.href({ v: "relacoes", lag: String(lag), x: x.key, y: y.key, o: ctx.sp.o || undefined })}#detalhe`}
                          className={`flex h-8 items-center justify-center rounded-md tabular-nums ${isSel ? "ring-2 ring-fg" : ""}`}
                          style={{
                            background: divergingColor(f.r, clear ? 1 : 0.35),
                            color: clear ? "#fff" : "var(--color-muted)",
                            fontWeight: clear ? 600 : 400,
                          }}
                          title={`${f.headline} · r ${rTxt(f.r)} · ${f.n} dias`}
                        >
                          {rTxt(f.r)}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: divergingColor(0.6) }} /> sobem juntos
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: divergingColor(-0.6) }} /> um sobe, o outro cai
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: divergingColor(0.3, 0.35) }} /> apagado = pode ser acaso
            </span>
          </div>
          <p className="mt-1 px-1 text-[10px] text-muted">Toque num quadrado para ver o gráfico. Número = correlação (−1 a +1).</p>
        </div>
      )}

      <SectionTitle>Todas as descobertas ({list.length})</SectionTitle>
      <div className="no-scrollbar -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <Link href={ctx.href({ v: "relacoes", lag: String(lag) })} className="chip shrink-0 text-xs" data-active={!ctx.sp.o}>
          Tudo
        </Link>
        {disc.outcomes.map((y) => (
          <Link
            key={y.key}
            href={ctx.href({ v: "relacoes", lag: String(lag), o: y.key })}
            className="chip shrink-0 text-xs"
            data-active={ctx.sp.o === y.key}
          >
            {y.short}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty>Nenhuma relação clara ainda para esse filtro.</Empty>
      ) : (
        <div className="space-y-2">
          {list.slice(0, 8).map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              href={`${ctx.href({ v: "relacoes", x: f.x.key, y: f.y.key, lag: String(f.lag), o: ctx.sp.o || undefined })}#detalhe`}
            />
          ))}
          {list.length > 8 && (
            <details className="group">
              <summary className="card cursor-pointer list-none text-center text-sm text-accent group-open:hidden">
                ver mais {list.length - 8} (evidência mais fraca)
              </summary>
              <div className="space-y-2">
                {list.slice(8).map((f) => (
                  <FindingCard
                    key={f.id}
                    f={f}
                    href={`${ctx.href({ v: "relacoes", x: f.x.key, y: f.y.key, lag: String(f.lag), o: ctx.sp.o || undefined })}#detalhe`}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function Detail({ f, ctx }: { f: Finding; ctx: Ctx }) {
  const xs = f.points.map((p) => p.x);
  const ys = f.points.map((p) => p.y);
  return (
    <div id="detalhe" className="card mb-2 scroll-mt-4 border-accent/40">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LevelChip level={f.level} />
          <ImpactTag f={f} />
        </div>
        <Link href={ctx.href({ v: "relacoes", lag: String(ctx.sp.lag), o: ctx.sp.o || undefined })} className="p-1 text-muted" aria-label="Fechar">
          <X size={18} />
        </Link>
      </div>
      <p className="text-lg leading-snug font-semibold">{f.headline}.</p>
      <p className="mt-2 mb-1.5 text-[11px] text-muted">
        {f.question} · média de {f.y.label.toLowerCase()}
      </p>
      <CompareBars
        rows={[
          { label: f.hi.label, value: f.hi.mean, display: f.y.fmt(f.hi.mean), n: f.hi.n, strong: true },
          { label: f.lo.label, value: f.lo.mean, display: f.y.fmt(f.lo.mean), n: f.lo.n },
        ]}
      />
      <div className="mt-3">
        <ScatterChart
          points={f.points.map((p) => ({ x: p.x, y: p.y, xl: f.x.binary ? (p.x ? "Sim" : "Não") : f.x.fmt(p.x), yl: f.y.fmt(p.y), date: p.date }))}
          xLabel={`${f.x.label}${f.lag ? " (dia anterior)" : ""}`}
          yLabel={f.y.label}
          xTicks={f.x.binary ? ["Não", "Sim"] : [f.x.fmt(Math.min(...xs)), f.x.fmt(Math.max(...xs))]}
          yTicks={[f.y.fmt(Math.min(...ys)), f.y.fmt(Math.max(...ys))]}
          binaryX={f.x.binary}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-card-2 px-1 py-1.5">
          <p className="text-[10px] text-muted">Dias</p>
          <p className="font-semibold">{f.n}</p>
        </div>
        <div className="rounded-lg bg-card-2 px-1 py-1.5">
          <p className="text-[10px] text-muted">Relação</p>
          <p className="font-semibold">
            {strengthWord(f.r)} <span className="text-[10px] font-normal text-muted">({rTxt(f.r)})</span>
          </p>
        </div>
        <div className="rounded-lg bg-card-2 px-1 py-1.5">
          <p className="text-[10px] text-muted">Chance de acaso</p>
          <p className="font-semibold">{chance(f.p)}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {f.level === "fraca"
          ? "Não dá para afirmar nada: a diferença é pequena ou há poucos dias."
          : "Isso é uma associação nos seus dados, não prova de causa. Um bom teste: mude esse hábito por 2 a 3 semanas e veja se o resultado acompanha."}
      </p>
    </div>
  );
}
