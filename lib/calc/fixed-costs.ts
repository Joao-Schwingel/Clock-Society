// Extraído mecanicamente de components/dashboard/fixed-costs-view.tsx:53-87 (spec Fase 1 §5).
// "now" deixa de ser lido dentro das funções e passa a ser parâmetro (yearMonth/year).

export type FixedCostActivePeriodInput = {
  start_date: string;
  qtdmonths: number;
  monthly_value: number;
};

// Retorna true se o custo está ativo no ano*12+mês informado.
export function isFixedCostActiveInMonth(
  cost: Pick<FixedCostActivePeriodInput, "start_date" | "qtdmonths">,
  yearMonth: number,
): boolean {
  const [cy, cm] = cost.start_date.split("-").map(Number);
  const startYM = cy * 12 + (cm - 1);
  const endYM = startYM + cost.qtdmonths - 1;
  return yearMonth >= startYM && yearMonth <= endYM;
}

// "Total Mensal Médio": soma dos custos ativos no mês informado (ano*12+mês).
export function sumActiveFixedCostsInMonth(
  costs: FixedCostActivePeriodInput[],
  yearMonth: number,
): number {
  return costs
    .filter((cost) => isFixedCostActiveInMonth(cost, yearMonth))
    .reduce((sum, cost) => sum + Number(cost.monthly_value), 0);
}

// Quantos meses do ano informado o custo está ativo.
export function getFixedCostMonthsInYear(
  cost: Pick<FixedCostActivePeriodInput, "start_date" | "qtdmonths">,
  year: number,
): number {
  const [cy, cm] = cost.start_date.split("-").map(Number);
  const costStartYM = cy * 12 + (cm - 1);
  const costEndYM = costStartYM + cost.qtdmonths - 1;

  const yearStartYM = year * 12;
  const yearEndYM = yearStartYM + 11;

  const effStart = Math.max(costStartYM, yearStartYM);
  const effEnd = Math.min(costEndYM, yearEndYM);

  return effStart > effEnd ? 0 : effEnd - effStart + 1;
}

// "Total Anual": valor × meses ativos no ano informado, somado entre todos os custos.
export function sumFixedCostsAnnualTotal(
  costs: FixedCostActivePeriodInput[],
  year: number,
): number {
  return costs.reduce(
    (total, cost) =>
      total + Number(cost.monthly_value) * getFixedCostMonthsInYear(cost, year),
    0,
  );
}
