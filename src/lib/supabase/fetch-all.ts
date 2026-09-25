/** Busca todas as páginas de uma consulta (o Supabase devolve no máximo 1000 linhas por vez). */
export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { data } = await make(page * pageSize, page * pageSize + pageSize - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
