// Filtros da consulta de vendas, extraídos de components/dashboard/sales-view.tsx (Fase 6, fatia
// 6.1) sem mudar a lógica — inclusive as duas formas diferentes de filtrar por mês: a tabela usa
// buildSaleDateRangeFilter (lib/calc/date-filters.ts) e a exportação usa exportMonthRangesFilter.
// Unificar as duas mudaria o CSV (Fase 1 §5, regra 4: só se unifica o que é idêntico).

// Busca por cliente ou produto (ilike) e, se o texto for número, pelo nº do pedido exato.
export function searchOrFilter(search: string): string | null {
  const q = search.trim();
  if (!q) return null;
  const orderNum = Number(q);
  const textFilter = `customer_name.ilike.%${q}%,product_name.ilike.%${q}%`;
  return !isNaN(orderNum) ? `${textFilter},order_number.eq.${orderNum}` : textFilter;
}

// Filtro de mês da tabela ("AAAA-MM"): do dia 1 até o dia 1 do mês seguinte, exclusivo.
export function tableMonthRange(dateFilter: string): { gte: string; lt: string } | null {
  if (!dateFilter) return null;
  const [filterYear, filterMonth] = dateFilter.split("-").map(Number);
  // filterMonth é 1-based; new Date(y, m, 1) usa 0-based → filterMonth já aponta pro mês seguinte
  const lt = new Date(filterYear, filterMonth, 1).toISOString().split("T")[0];
  return { gte: `${dateFilter}-01`, lt };
}

// Filtro de meses do topo, na forma usada pela exportação (meses 0..11, timestamps ISO).
export function exportMonthRangesFilter(months: number[], year: string): string | null {
  if (months.length === 0) return null;
  return months
    .map((m) => {
      const start = new Date(Number(year), m, 1);
      const end = new Date(Number(year), m + 1, 1);
      return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
    })
    .join(",");
}

// Vendas de um vendedor, filtradas na própria view pela coluna jsonb `salespersons` (§7.5 do
// planejamento). Substitui a busca prévia dos ids em sale_salespersons + `.in("id", …)`, que
// estourava o tamanho da URL com muitas vendas. Argumentos para `query.filter(...)`.
export function salespersonContainsFilter(salespersonId: string): [string, string, string] {
  return ["salespersons", "cs", JSON.stringify([{ id: salespersonId }])];
}
