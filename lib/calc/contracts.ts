// Extraído mecanicamente de components/dashboard/contracts-view.tsx:37-72 (spec Fase 1 §5).
// "hoje"/ano atual deixam de ser lidos dentro das funções e passam a ser parâmetros.

export type ContractPeriodInput = {
  start_date: string;
  end_date: string | null;
  monthly_value: number;
};

// Ativo = sem data de fim ou fim >= hoje.
export function isContractActive(
  contract: Pick<ContractPeriodInput, "end_date">,
  todayISO: string,
): boolean {
  return !contract.end_date || contract.end_date >= todayISO;
}

// Conta quantos meses do ano informado o contrato está ativo, usando índice ano*12+mês.
export function getContractActiveMonthsInYear(
  contract: Pick<ContractPeriodInput, "start_date" | "end_date">,
  year: number,
): number {
  const [sy, sm] = contract.start_date.split("-").map(Number);
  const startYM = sy * 12 + (sm - 1);

  const endYM = contract.end_date
    ? (() => {
        const [ey, em] = contract.end_date!.split("-").map(Number);
        return ey * 12 + (em - 1);
      })()
    : Infinity;

  const yearStartYM = year * 12;
  const yearEndYM = year * 12 + 11;

  const effStart = Math.max(startYM, yearStartYM);
  const effEnd = Math.min(endYM, yearEndYM);

  return effStart > effEnd ? 0 : effEnd - effStart + 1;
}

export type ContractsSummary = {
  activeCount: number;
  totalMonthly: number;
  totalAnnual: number;
};

// C-CON-01: total mensal dos ativos; total anual pelos meses ativos no ano corrente.
export function summarizeContracts(
  contracts: ContractPeriodInput[],
  todayISO: string,
  currentYear: number,
): ContractsSummary {
  const activeContracts = contracts.filter((c) => isContractActive(c, todayISO));

  const totalMonthly = activeContracts.reduce(
    (sum, c) => sum + Number(c.monthly_value),
    0,
  );

  const totalAnnual = contracts.reduce(
    (sum, c) => sum + Number(c.monthly_value) * getContractActiveMonthsInYear(c, currentYear),
    0,
  );

  return {
    activeCount: activeContracts.length,
    totalMonthly,
    totalAnnual,
  };
}
