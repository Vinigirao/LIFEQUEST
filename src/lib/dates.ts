export const TZ = "America/Sao_Paulo";

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Soma dias a uma data YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD. */
export function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Segunda-feira da semana da data informada. */
export function startOfWeek(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function daysInMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Valida se a string é uma data YYYY-MM-DD; caso contrário devolve hoje. */
export function safeDate(value: string | undefined | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayISO();
}

/** "qui, 24/09" */
export function formatDayShort(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** "quinta-feira, 24 de setembro" */
export function formatDayLong(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Data e hora de um timestamp no fuso de São Paulo: "24/09 às 07:30" */
export function formatDateTime(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} às ${time}`;
}

/** Offset (ms) do fuso em um instante. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** Converte data (YYYY-MM-DD) + hora (HH:MM) do fuso de SP em um Date (UTC). */
export function zonedToUtc(dateIso: string, time: string, tz: string = TZ): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  const second = guess - tzOffsetMs(new Date(first), tz);
  return new Date(second);
}
