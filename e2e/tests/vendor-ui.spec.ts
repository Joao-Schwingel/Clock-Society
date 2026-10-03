import { test } from "../test-helpers";

// Fase 5 §5 "Telas" / Fase 6 fatia 6.8. `test.fixme` = `it.todo` do Playwright.
// Casos marcados "#13" dependem das decisões da issue #13 (Q2, Q4, Q10, 3.1, 3.9).

test.fixme("V-UI-01 — vend-a@t1 vê [empresas em que atua] → Vendas, Comissões e Estoque, sem os cartões de visão geral", () => {});
test.fixme("V-UI-02 — vend-ab@t1 (Carla em A e B) vê o seletor com as duas empresas, e só elas", () => {});
test.fixme("V-UI-03 — vend-zero@t1 (vínculo sem vendas) vê estado vazio, sem erro", () => {});
test.fixme("V-UI-03 — vendedor-sem-vinculo@t1 vê estado vazio, sem erro (antes: /403 — ver docs/fase-5/README.md)", () => {});
test.fixme("V-UI-04 — Vendas de vend-a@t1: só as dele (inclui a compartilhada com Bruno); sem Custo Total, sem coluna líquida, sem ações", () => {});
test.fixme("V-UI-04 — filtros, busca e paginação funcionam no subconjunto do vendedor", () => {});
test.fixme("V-UI-04 — exportação conforme Q4 (#13)", () => {});
test.fixme("V-UI-04 — coluna de comissão mostra só o próprio percentual na venda compartilhada (decisão 3.1, #13)", () => {});
test.fixme("V-UI-05 — cartões da aba Vendas: nº de vendas, valor vendido e comissão do período vinda da RPC (3.3)", () => {});
test.fixme("V-UI-06 — Comissões: os mesmos cartões e números que o admin vê para a mesma empresa e período (duas sessões; regras de Q2/Q10, #13)", () => {});
test.fixme("V-UI-07 — Estoque: todas as colunas, inclusive custo; cartões de resumo; sem Novo Item, sem ações e sem formulário", () => {});
