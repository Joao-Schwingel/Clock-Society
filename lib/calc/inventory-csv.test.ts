import { describe, expect, it } from "vitest";
import {
  buildInventoryCsvContent,
  buildInventoryCsvRow,
  INVENTORY_CSV_HEADERS,
  type InventoryCsvRowInput,
} from "./inventory-csv";

// Parser simples de uma linha CSV (respeita campos entre aspas, já que os valores monetários em
// pt-BR usam vírgula como separador decimal). Mesmo auxiliar do sales-csv.test.ts.
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

const item = (over: Partial<InventoryCsvRowInput> = {}): InventoryCsvRowInput => ({
  product_name: "Relógio A",
  location: "Prateleira 1",
  quantity: 3,
  unit_cost: 1500.5,
  total_value: 4501.5,
  last_updated: "2026-09-15",
  notes: null,
  ...over,
});

describe("CSV do estoque", () => {
  it("tem as colunas da tabela, mais Observações", () => {
    expect(INVENTORY_CSV_HEADERS).toEqual([
      "Produto",
      "Localização",
      "Quantidade",
      "Custo Unit.",
      "Valor Total",
      "Última Atualização",
      "Observações",
    ]);
  });

  it("formata dinheiro em pt-BR e data em DD/MM/AAAA", () => {
    const [produto, local, qtd, custo, total, data] = buildInventoryCsvRow(item());
    expect(produto).toBe("Relógio A");
    expect(local).toBe("Prateleira 1");
    expect(qtd).toBe("3");
    expect(custo).toBe('"1.500,50"'); // tem vírgula decimal, então vai entre aspas
    expect(total).toBe('"4.501,50"');
    expect(data).toBe("15/09/2026");
  });

  it("campo vazio vira traço, como na tela", () => {
    const linha = buildInventoryCsvRow(
      item({ location: null, notes: null, last_updated: null, product_name: "" }),
    );
    expect(linha[0]).toBe("-");
    expect(linha[1]).toBe("-");
    expect(linha[5]).toBe("-");
    expect(linha[6]).toBe("-");
  });

  it("recalcula o valor total quando a coluna vem nula", () => {
    // vai entre aspas porque a vírgula decimal é o separador de campo do CSV
    expect(buildInventoryCsvRow(item({ total_value: null, quantity: 2, unit_cost: 10 }))[4]).toBe('"20,00"');
  });

  it("escapa vírgula, aspas e quebra de linha nas observações", () => {
    const linha = buildInventoryCsvRow(item({ notes: 'peça "A", com defeito\nver foto' }));
    expect(linha[6]).toBe('"peça ""A"", com defeito\nver foto"');
  });

  it("monta o arquivo com BOM, cabeçalho e uma linha por item", () => {
    const conteudo = buildInventoryCsvContent([item(), item({ product_name: "Relógio B" })]);
    expect(conteudo.startsWith("﻿")).toBe(true); // o Excel precisa do BOM para o UTF-8
    const linhas = conteudo.slice(1).split("\n");
    expect(linhas).toHaveLength(3);
    expect(parseCsvLine(linhas[0])).toEqual(INVENTORY_CSV_HEADERS);
    expect(parseCsvLine(linhas[1])[0]).toBe("Relógio A");
    expect(parseCsvLine(linhas[2])[0]).toBe("Relógio B");
  });

  it("lista vazia gera só o cabeçalho", () => {
    expect(buildInventoryCsvContent([]).slice(1)).toBe(INVENTORY_CSV_HEADERS.join(","));
  });
});
