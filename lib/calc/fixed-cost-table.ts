// Extraído mecanicamente de components/dashboard/fixed-cost-table.tsx:66-108 (spec Fase 1 §5).

import type { FixedCost } from "@/lib/types";

export type FixedCostTableFilters = {
  searchTerm: string;
  categoryFilter: string;
  dateFilter: string; // "YYYY-MM" ou ""
  saleType: string; // "ambos" | "fixo" | "variável"
  sortDirection: "asc" | "desc";
};

// C-FIX-02: busca por nome ou categoria; mês em que está ativo; tipo Fixo/Variável;
// ordem por data de início.
export function filterAndSortFixedCosts(
  fixedCosts: FixedCost[],
  filters: FixedCostTableFilters,
): FixedCost[] {
  const { searchTerm, categoryFilter, dateFilter, saleType, sortDirection } = filters;

  return fixedCosts
    .filter((cost) => {
      const matchesSearch =
        cost.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cost.category?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchesCategory =
        categoryFilter === "all" || cost.category === categoryFilter;

      const matchesDate = (() => {
        if (!dateFilter) return true;

        const [y, m, d] = cost.start_date.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);

        const endMonth = new Date(
          startMonth.getFullYear(),
          startMonth.getMonth() + cost.qtdmonths,
          1,
        );

        const [year, month] = dateFilter.split("-").map(Number);

        const filterMonth = new Date(year, month - 1, 1);

        return filterMonth >= startMonth && filterMonth < endMonth;
      })();

      const matchesType =
        saleType === "ambos" || cost.category.toLowerCase() === saleType;

      return matchesSearch && matchesCategory && matchesDate && matchesType;
    })
    .sort((a, b) => {
      const valueA = new Date(a.start_date).getTime();
      const valueB = new Date(b.start_date).getTime();

      if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
      if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
}
