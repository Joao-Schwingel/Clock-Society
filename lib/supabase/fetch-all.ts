import type { PostgrestError } from "@supabase/supabase-js"

// O PostgREST do Supabase corta qualquer resposta em `max_rows` (1000 por padrão),
// sem erro nem aviso. Por isso consultas sem paginação somem com linhas
// silenciosamente quando o volume passa disso.
export const SUPABASE_PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>

/**
 * Busca todas as linhas de uma consulta paginando com `.range()`.
 * `buildPage` recebe o intervalo da página e deve devolver a consulta já com
 * `.range(from, to)` aplicado e uma ordenação estável (ex.: `.order("id")`),
 * senão linhas podem repetir ou faltar entre páginas.
 * Lança o erro do Supabase se qualquer página falhar.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PageResult<T>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < SUPABASE_PAGE_SIZE) break
  }

  return rows
}
