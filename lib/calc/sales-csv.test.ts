import { describe, expect, it } from "vitest";
import { buildSalesCsvContent, SALES_CSV_HEADERS, type SalesCsvRowInput } from "./sales-csv";

// Parser simples de uma linha CSV (respeita campos entre aspas, já que os
// valores monetários em pt-BR usam vírgula como separador decimal).
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

// C-SALES-10
describe("buildSalesCsvContent", () => {
  it("gera 14 colunas, na ordem atual", () => {
    expect(SALES_CSV_HEADERS).toHaveLength(14);
    expect(SALES_CSV_HEADERS).toEqual([
      "Data",
      "Nº Pedido",
      "Produtos",
      "Cliente",
      "Vendedor",
      "Status",
      "Quantidade",
      "Valor do Produto",
      "Custo Total",
      "Valor Líquido",
      "Valor Líquido após Comissão",
      "Entrada",
      "Faltante",
      "Status Pagamento",
    ]);
  });

  it("começa com o BOM (\\uFEFF)", () => {
    const csv = buildSalesCsvContent([], {}, {});
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("formata a data em DD/MM/AAAA", () => {
    const sale: SalesCsvRowInput = {
      id: "s1",
      sale_date: "2026-03-05",
      order_number: "1",
      customer_name: "Cliente",
      status: "concluída",
      quantity: 1,
      product_name: "Produto",
      total_price: 100,
      total_costs: 0,
      entry_value: 100,
      payment_status: "pago",
      salespersons: [],
    };
    const csv = buildSalesCsvContent([sale], {}, {});
    const dataLine = csv.split("\n")[1];
    expect(dataLine.startsWith("05/03/2026,")).toBe(true);
  });

  it("calcula Valor Líquido após Comissão (valor líquido - comissão dos vendedores)", () => {
    const sale: SalesCsvRowInput = {
      id: "s1",
      sale_date: "2026-01-01",
      order_number: "1",
      customer_name: "Cliente",
      status: "concluída",
      quantity: 1,
      product_name: "Produto",
      total_price: 1000,
      total_costs: 200,
      entry_value: 1000,
      payment_status: "pago",
      salespersons: [{ name: "Ana", commission_percent: 10 }],
    };
    // valor líquido = 1000 - 200 = 800; comissão = 800 * 10% = 80; após comissão = 720
    const csv = buildSalesCsvContent([sale], {}, {});
    const cols = parseCsvLine(csv.split("\n")[1]);
    expect(cols[9]).toBe("800,00"); // Valor Líquido (total - custos)
    expect(cols[10]).toBe("720,00"); // Valor Líquido após Comissão
  });

  it("faltante é 0 quando pago, senão max(total - entrada, 0)", () => {
    const pago: SalesCsvRowInput = {
      id: "s1",
      sale_date: "2026-01-01",
      order_number: "1",
      customer_name: null,
      status: "concluída",
      quantity: 1,
      product_name: "P",
      total_price: 100,
      total_costs: 0,
      entry_value: 0,
      payment_status: "pago",
      salespersons: [],
    };
    const pendente: SalesCsvRowInput = { ...pago, id: "s2", payment_status: "pendente", entry_value: 30 };

    const csv = buildSalesCsvContent([pago, pendente], {}, {});
    const [, line1, line2] = csv.split("\n");
    expect(parseCsvLine(line1)[12]).toBe("0,00"); // Faltante (pago)
    expect(parseCsvLine(line2)[12]).toBe("70,00"); // Faltante (100 - 30)
  });

  it("escapa vírgula, aspas e quebra de linha nos campos", () => {
    const sale: SalesCsvRowInput = {
      id: "s1",
      sale_date: "2026-01-01",
      order_number: "1",
      customer_name: 'Cliente "especial", com vírgula\ne quebra',
      status: "pendente",
      quantity: 1,
      product_name: "P",
      total_price: 10,
      total_costs: 0,
      entry_value: 0,
      payment_status: "pendente",
      salespersons: [],
    };
    const csv = buildSalesCsvContent([sale], {}, {});
    expect(csv).toContain('"Cliente ""especial"", com vírgula\ne quebra"');
  });
});
