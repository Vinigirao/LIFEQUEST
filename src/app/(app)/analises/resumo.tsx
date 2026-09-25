import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lightbulb } from "lucide-react";
import { Empty, SectionTitle } from "@/components/ui";
import { Sparkline } from "@/components/viz/charts";
import { SINGLE } from "@/components/viz/palette";
import { bestVsWorst, discover } from "@/lib/insights/discover";
import { coverage, trends } from "@/lib/insights/patterns";
import { type Ctx, num } from "./ctx";
import { FindingCard } from "./finding-card";

export function Resumo({ ctx }: { ctx: Ctx }) {
  const tr = trends(ctx.data, ctx.today).filter((t) => t.now != null);
  const disc = discover(ctx.data, ctx.rows);
  const bw = bestVsWorst(ctx.data, ctx.rows, disc.factors);
  const cov = coverage(ctx.rows);
  const top = disc.findings.slice(0, 4);

  return (
    <>
      {/* ------------------------------------------------ momento */}
      <SectionTitle>Últimos 7 dias × 4 semanas antes</SectionTitle>
      {tr.length === 0 ? (
        <Empty>Registre dieta, humor e treinos por alguns dias para ver suas tendências.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {tr.map((t) => {
            const d = t.delta;
            const rel = d != null && t.before ? Math.abs(d) / Math.abs(t.before) : 0;
            const flat = d == null || rel < 0.03;
            const good = !flat && t.better !== 0 ? (d as number) * t.better > 0 : null;
            return (
              <div key={t.key} className="card px-3 py-2.5">
                <p className="text-[11px] text-muted">{t.label}</p>
                <p className="text-xl font-bold">
                  {num(t.now, t.digits)}
                  <span className="ml-1 text-[11px] font-normal text-muted">{t.unit}</span>
                </p>
                <p
                  className={`flex items-center gap-0.5 text-[11px] ${good == null ? "text-muted" : good ? "text-ok" : "text-bad"}`}
                >
                  {flat ? <ArrowRight size={12} /> : (d as number) > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {d == null ? "sem base de comparação" : flat ? "estável" : `${(d as number) > 0 ? "+" : "−"}${num(Math.abs(d as number), t.digits)} vs antes`}
                </p>
                <div className="mt-1">
                  <Sparkline values={t.series} color={SINGLE} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted">Linha: média móvel de 7 dias nos últimos 60 dias. Peso usa média suavizada.</p>

      {/* ------------------------------------------------ descobertas */}
      <SectionTitle
        action={
          disc.findings.length > top.length ? (
            <Link href={ctx.href({ v: "relacoes" })} className="text-xs text-accent">
              ver todas ({disc.findings.length})
            </Link>
          ) : undefined
        }
      >
        Principais descobertas
      </SectionTitle>
      {top.length === 0 ? (
        <Empty>
          Ainda sem relações claras nos últimos {ctx.period} dias ({disc.tests} combinações testadas). Continue registrando
          dieta, humor e treinos: com 3 a 4 semanas de dados as descobertas começam a aparecer.
        </Empty>
      ) : (
        <div className="space-y-2">
          {top.map((f) => (
            <FindingCard key={f.id} f={f} href={ctx.href({ v: "relacoes", x: f.x.key, y: f.y.key, lag: String(f.lag) })} />
          ))}
        </div>
      )}

      {/* ------------------------------------------------ melhores x piores dias */}
      {bw && bw.rows.length > 0 && (
        <>
          <SectionTitle>Seus melhores × piores dias</SectionTitle>
          <div className="card">
            <p className="text-xs text-muted">
              Comparei os {bw.n} dias de humor mais alto (média {num(bw.goodMood, 1)}) com os {bw.n} de humor mais baixo (média{" "}
              {num(bw.badMood, 1)}). O que foi diferente:
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="pb-1 text-left font-normal" />
                  <th className="pb-1 text-right font-normal">😄 melhores</th>
                  <th className="pb-1 text-right font-normal">😞 piores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bw.rows.map((r) => (
                  <tr key={`${r.v.key}-${r.lag}`}>
                    <td className="py-1.5 pr-2">
                      {r.v.label}
                      <span className="block text-[10px] text-muted">{r.lag ? "no dia anterior" : "no próprio dia"}</span>
                    </td>
                    <td className={`py-1.5 pl-2 text-right whitespace-nowrap tabular-nums ${r.z > 0 ? "font-semibold" : "text-muted"}`}>{r.v.fmt(r.good)}</td>
                    <td className={`py-1.5 pl-2 text-right whitespace-nowrap tabular-nums ${r.z < 0 ? "font-semibold" : "text-muted"}`}>{r.v.fmt(r.bad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-muted">Em negrito, o grupo com o valor maior. Ordenado pela diferença.</p>
          </div>
        </>
      )}

      {/* ------------------------------------------------ cobertura */}
      <SectionTitle>Seus registros · {ctx.period} dias</SectionTitle>
      <div className="card space-y-2">
        {cov.items.map((i) => (
          <div key={i.key} className="grid grid-cols-[88px_1fr_60px] items-center gap-2 text-xs">
            <span className="text-muted">{i.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-card-2">
              <div className="h-full rounded-full" style={{ width: `${Math.round(i.pct * 100)}%`, background: SINGLE }} />
            </div>
            <span className="text-right tabular-nums">
              {i.n}/{cov.days}
            </span>
          </div>
        ))}
        <p className="flex gap-1.5 pt-1 text-[11px] text-muted">
          <Lightbulb size={14} className="shrink-0 text-accent" />
          Quanto mais dias com dieta e humor registrados, mais confiáveis ficam as descobertas.
        </p>
      </div>

      <details className="card mt-4 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-fg">Como as descobertas são calculadas</summary>
        <div className="mt-2 space-y-1.5">
          <p>
            Cada dia vira uma linha com dieta, treino, humor, peso e gastos. O app testa {disc.tests} combinações de
            &ldquo;fator → resultado&rdquo;, no mesmo dia e no dia seguinte (ex.: proteína de ontem → volume do treino de hoje).
          </p>
          <p>
            Para cada uma, compara os dias com o fator alto (terço de cima) com os dias com o fator baixo (terço de baixo), e
            mede a força da relação (correlação de Spearman, que não é enganada por valores extremos).
          </p>
          <p>
            Como são muitos testes, algumas relações aparecem por acaso. Por isso o app corrige para múltiplos testes
            (Benjamini-Hochberg) e mostra o nível de confiança: 3 pontos = evidência forte, 2 = boa evidência, 1 = só uma pista.
          </p>
          <p>Correlação não é causa: use como hipótese e teste mudando um hábito por algumas semanas.</p>
        </div>
      </details>
    </>
  );
}
