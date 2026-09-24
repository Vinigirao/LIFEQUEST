import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { addDays, formatDayLong, todayISO } from "@/lib/dates";
import type { Status } from "@/lib/goals";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{children}</p>;
}

const STATUS_COLOR: Record<Status, string> = {
  green: "var(--color-ok)",
  yellow: "var(--color-warn)",
  red: "var(--color-bad)",
  none: "var(--color-line)",
};

export function StatusDot({ status }: { status: Status }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />;
}

export function ProgressBar({ pct, status = "none", color }: { pct: number; status?: Status; color?: string }) {
  const width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-card-2">
      <div
        className="h-full rounded-full transition-all"
        style={{ width, background: color ?? (status === "none" ? "var(--color-accent)" : STATUS_COLOR[status]) }}
      />
    </div>
  );
}

/** Navegação de dia: ‹ quinta-feira, 24 de setembro › */
export function DateNav({ basePath, date }: { basePath: string; date: string }) {
  const today = todayISO();
  const next = addDays(date, 1);
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-card px-2 py-1">
      <Link href={`${basePath}?d=${addDays(date, -1)}`} className="p-2 text-muted" aria-label="Dia anterior">
        <ChevronLeft size={20} />
      </Link>
      <div className="text-center">
        <p className="text-sm font-semibold first-letter:uppercase">{formatDayLong(date)}</p>
        {date !== today && (
          <Link href={basePath} className="text-xs text-accent">
            voltar para hoje
          </Link>
        )}
      </div>
      {next <= today ? (
        <Link href={`${basePath}?d=${next}`} className="p-2 text-muted" aria-label="Próximo dia">
          <ChevronRight size={20} />
        </Link>
      ) : (
        <span className="p-2 text-line">
          <ChevronRight size={20} />
        </span>
      )}
    </div>
  );
}

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return "–";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}
