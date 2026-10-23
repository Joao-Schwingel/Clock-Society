// Extraído mecanicamente de 4 cópias idênticas (spec Fase 1 §5, regra 4 — cópias só são
// unificadas se forem idênticas):
//   dashboard-view.tsx:107-115; sales-view.tsx:88-95, :137-144, :334-341

// Monta o filtro `.or(...)` do PostgREST para os meses selecionados de um ano.
// Retorna null quando months=[] (sem filtro de mês).
export function buildSaleDateRangeFilter(
  months: number[],
  year: string,
): string | null {
  if (months.length === 0) return null;

  const ranges = months.map((m) => {
    const start = new Date(Number(year), m, 1);
    const end = new Date(Number(year), m + 1, 1);
    return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
  });
  return ranges.join(",");
}
