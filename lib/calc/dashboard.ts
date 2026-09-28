// Extraído mecanicamente de components/dashboard/dashboard-view.tsx (spec Fase 1 §5).
// Regra da extração: mover sem alterar a lógica, inclusive bugs conhecidos (N12).

export type FixedCostPeriodInput = {
  monthly_value: number;
  start_date: string;
  qtdmonths: number;
};

// Soma o valor de cada custo fixo nos meses selecionados do ano selecionado.
// Quando months=[] (sem filtro), considera todos os 12 meses do ano selecionado.
export function sumFixedCostsForPeriod(
  fixedCosts: FixedCostPeriodInput[],
  months: number[],
  year: string,
): number {
  const activeMonths =
    months.length > 0 ? months : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  let total = 0;
  for (const cost of fixedCosts) {
    // start_date vem como "YYYY-MM-DD" — parse sem conversão de timezone
    const [sy, sm] = cost.start_date.split("-").map(Number);
    const startYearMonth = sy * 12 + (sm - 1); // sm é 1-based
    const endYearMonth = startYearMonth + cost.qtdmonths - 1;

    for (const month of activeMonths) {
      const filterYearMonth = Number(year) * 12 + month; // month é 0-based
      if (
        filterYearMonth >= startYearMonth &&
        filterYearMonth <= endYearMonth
      ) {
        total += Number(cost.monthly_value);
      }
    }
  }
  return total;
}

export type CommissionSaleInput = {
  id: string;
  total_price: number;
  salespersons: { id: string; name: string; commission_percent: number }[];
};

export type CommissionSummary = {
  id: string;
  name: string;
  salesCount: number;
  totalSales: number;
  totalCosts: number;
  netProfit: number;
  totalCommission: number;
};

// Resumo de comissões por vendedor. Vendas com dois vendedores somam o valor cheio da
// venda para cada um (achado 9); vendedor inativo entra no total pois o filtro de
// atividade é aplicado antes, na query de vendedores (N12).
export function summarizeCommissionsBySalesperson(
  sales: CommissionSaleInput[],
  costsBySaleId: Record<string, number>,
): { summaries: CommissionSummary[]; totalCommission: number } {
  const commMap: Record<string, CommissionSummary> = {};

  for (const sale of sales) {
    const saleCost = costsBySaleId[sale.id] ?? 0;
    const saleNet = sale.total_price - saleCost;

    for (const sp of sale.salespersons) {
      if (!commMap[sp.id]) {
        commMap[sp.id] = {
          id: sp.id,
          name: sp.name,
          salesCount: 0,
          totalSales: 0,
          totalCosts: 0,
          netProfit: 0,
          totalCommission: 0,
        };
      }
      commMap[sp.id].salesCount += 1;
      commMap[sp.id].totalSales += sale.total_price;
      commMap[sp.id].totalCosts += saleCost;
      commMap[sp.id].netProfit += saleNet;
      commMap[sp.id].totalCommission += (saleNet * Number(sp.commission_percent)) / 100;
    }
  }

  const summaries = Object.values(commMap);
  const totalCommission = summaries.reduce((sum, s) => sum + s.totalCommission, 0);
  return { summaries, totalCommission };
}
