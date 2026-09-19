# Fase 1 — Rede de testes sobre o sistema atual

**Objetivo:** fixar em testes automatizados o comportamento atual do sistema (monousuário) antes de qualquer mudança de permissão.
**Regra da fase:** nenhuma mudança de comportamento. As únicas alterações de código de produção permitidas são as extrações mecânicas da §5.
**Depende de:** nada. **Libera:** Fase 2.

---

## 1. Ponto de partida

- Nenhum teste e nenhuma ferramenta de teste no repositório; `pnpm lint` falha porque o ESLint não está instalado (N2).
- A lógica de negócio vive dentro dos componentes (`dashboard-view.tsx`, `sales-view.tsx`, …), e as consultas saem direto do navegador.
- O schema dos scripts divergiu do banco (achado 4, N1, N5). A view `sales_with_salespersons`, usada pelo dashboard, nem está versionada.
- Parte do comportamento depende do relógio e do fuso (N6).

Por isso a rede tem camadas diferentes, cada uma cobrindo o que as outras não alcançam.

---

## 2. Estratégia em camadas

| Camada | Ferramenta | Cobre | Roda contra |
|---|---|---|---|
| **UNIT** | Vitest (node) | Regras de cálculo e de filtro extraídas dos componentes (§5) | — |
| **DB** | Vitest + `supabase-js` | RLS, grants, views e gatilhos, pelo mesmo caminho do navegador (PostgREST + JWT de usuário real) | Supabase local (CLI + Docker) |
| **E2E** | Playwright (Chromium) | Telas completas do jeito que o admin usa: números, filtros, formulários, exportação | `next dev` + Supabase local + fixture |
| **COMP** *(opcional)* | Vitest + Testing Library + MSW | Estados difíceis de provocar via E2E (erro de rede, carregando) | — |

**Por que o banco é testado via PostgREST e não via SQL puro (D-2):** o navegador fala com o PostgREST
usando o JWT do usuário. Testar por esse caminho pega de uma vez grant faltando, view ignorando RLS e
política errada, que são justamente os achados 1–3. É também o que a skill `tdd` pede: testar pela
interface pública.

**Por que E2E contra banco real, e não componentes com mock:** o que precisa sobreviver às Fases 3 e 6
são os **números na tela**. Os testes de E2E não sabem se o número veio de um cálculo no navegador ou
de uma RPC, e é isso que os faz servir de contrato de regressão.

---

## 3. Infraestrutura (entregáveis)

- [ ] Vitest com `TZ=America/Sao_Paulo` e relógio fixo (`vi.setSystemTime`)
- [ ] Playwright (Chromium) com relógio fixo (`page.clock`), `webServer` subindo `next dev` apontado para o Supabase local
- [ ] `supabase init` + `config.toml` local (é nele que o hook de token será habilitado na Fase 3)
- [ ] **Baseline do schema (item 1.1 do planejamento):**
  - [ ] dump *schema-only* do projeto de produção (`public`, e as partes relevantes de `auth`: gatilhos e funções)
  - [ ] diff contra `scripts/*.sql`, com toda divergência documentada — no mínimo: colunas do achado 4, `sale_salespersons`, `sales_with_salespersons`, gatilho `recalc_sale_total` (N1), unicidade de `companies.code` (N5), gatilho de `end_date` em `fixed_costs`
  - [ ] inventário das políticas: `select * from pg_policies where schemaname = 'public'`, salvo como linha de base do rollback
  - [ ] inventário de grants por papel (`anon`, `authenticated`) em tabelas e views
  - [ ] baseline versionada como primeira migration de `supabase/migrations/` (D-3)
- [ ] Seed sintético (§4) — **nunca dados reais**
- [ ] Scripts `pnpm`: `test` (unit), `test:db`, `test:e2e`, `typecheck` (`tsc --noEmit`)
- [ ] ESLint com `eslint-config-next`, ou remoção do script (D-10)
- [ ] CI no GitHub Actions: `typecheck` → `lint` → unit → `supabase start` → DB → build → E2E
- [ ] Script de retrato de produção (§6)

---

## 4. Fixture — dataset de teste

O fixture é o mesmo em todas as fases e cresce nas Fases 2 e 5. Nesta fase ele precisa cobrir:

| Elemento | Casos obrigatórios |
|---|---|
| Usuários | `admin@t1`, dono de tudo (inquilino T1). `outro@t2`, com dados próprios, para isolamento — empresas com códigos X/Y (N5) |
| Empresas (T1) | Clock Society (A), The Secret (B), Morfeus (C), cada uma com o vendedor "Site" criado pelo gatilho |
| Vendedores | 2 ativos na A; a mesma pessoa em A e B (dois registros); 1 ativo sem nenhuma venda; 1 **inativo com venda concluída** no período (N12) |
| Vendas | concluídas e pendentes; pagas e com pagamento pendente; à vista (entrada = total), entrada 0 e entrada parcial; vários itens; **venda compartilhada** entre 2 vendedores com percentuais diferentes; percentual que gera 3+ casas decimais na comissão (N13); venda sem custo e venda com custos de vários tipos; vendas no dia 1 e no último dia do mês, em 31/12 e 01/01; mais de 10 vendas numa empresa (paginação); nº de pedido buscável; cliente e produto buscáveis por trecho |
| Custos de venda | vários tipos, inclusive em venda pendente |
| Custos fixos | ativo o ano todo; atravessando a virada do ano; valor negativo; categorias Fixo e Variável; encerrado antes do mês corrente |
| Contratos | sem data de fim; encerrado; iniciando no meio do ano |
| Estoque | itens com e sem localização, em mais de uma empresa |

**Relógio dos testes:** 15/09/2026 12:00 (−03:00). Dados em 2025 e 2026 (o ano padrão das telas é 2026, N6).

**Tabela de números esperados (entregável):** para cada empresa × período (2026 inteiro; set/2026;
jan+mar/2026; um mês sem vendas; 2025 inteiro), os valores de todos os cartões do Dashboard, dos
cartões por vendedor, dos cartões da aba Vendas, de Estoque, de Custos e de Contratos. **Calculada à
mão (planilha), sem olhar o código.** Ela é o oráculo:

- se o código concordar, o teste fixa o valor;
- se discordar, investigar: erro na planilha → corrigir a planilha; comportamento do código diferente do
  esperado → o teste fixa **o valor do código** e o caso entra na lista de bugs conhecidos (D-5).

---

## 5. Extrações permitidas

Para as regras de cálculo terem teste unitário, elas precisam sair de dentro dos componentes.
Regras:

1. Mover sem alterar a lógica, **inclusive os bugs**.
2. Dependências implícitas viram parâmetro (`months`, `year`, data de hoje) — nada de ler estado ou `new Date()` dentro da função.
3. Um commit por extração. O componente passa a chamar a função, e os testes E2E continuam verdes.
4. Cópias só são unificadas se forem idênticas.

| Função (nome sugerido) | Origem | Casos |
|---|---|---|
| soma de custos fixos no período | `dashboard-view.tsx:75-99` | C-DASH-01 |
| resumo de comissões por vendedor | `dashboard-view.tsx:178-205` | C-DASH-02 |
| intervalos de mês para o filtro | `dashboard-view.tsx:107-115`; `sales-view.tsx:88-95`, `:137-144`, `:334-341` (4 cópias) | C-DASH-05 |
| estatísticas da aba Vendas | `sales-view.tsx:514-545` | C-SALES-01 |
| linhas do CSV de vendas | `sales-view.tsx:419-489` | C-SALES-10 |
| regras de pagamento do formulário de venda | `sales-form.tsx:209-239` | C-SALES-12 |
| custo fixo ativo no mês; totais mensal e anual | `fixed-costs-view.tsx:53-87` | C-FIX-01 |
| filtro e ordenação da tabela de custos fixos | `fixed-cost-table.tsx:66-108` | C-FIX-02 |
| contrato ativo; totais mensal e anual | `contracts-view.tsx:37-72` | C-CON-01 |

---

## 6. Retrato dos números de produção

Substitui a "foto" manual da nota do §8.5 do planejamento. É executado na Fase 4, imediatamente antes
e imediatamente depois da janela de implantação.

- [ ] Consulta SQL **somente leitura** com agregados por empresa × mês (2025–2026): nº de vendas por status, soma de `total_price`, soma dos custos de venda, nº de itens, comissão por vendedor pela regra atual (C-DASH-02) e contagem de linhas por tabela
- [ ] Roteiro de exportação do CSV da aba Vendas de cada empresa, sem filtro, pela própria tela — permite um diff linha a linha antes/depois
- [ ] **Resultados guardados fora do repositório** (D-11): o repositório é público, e os dados são financeiros e trazem nomes de clientes

---

## 7. Inventário de comportamentos (casos de caracterização)

### Autenticação e rotas

| ID | Camada | Comportamento atual |
|---|---|---|
| C-AUTH-01 | E2E | Sem sessão, `/dashboard` redireciona para `/auth/login` |
| C-AUTH-02 | E2E | Login válido leva a `/dashboard`; inválido mostra a mensagem de erro e permanece na tela |
| C-AUTH-03 | E2E | `/` leva a `/dashboard` com sessão e a `/auth/login` sem sessão |
| C-AUTH-04 | E2E | "Sair" encerra a sessão e volta ao login; voltar no navegador não reabre o dashboard |
| C-AUTH-05 | UNIT | Rotas públicas do middleware: `/`, `/auth/login`, `/auth/sign-up`, `/auth/sign-up-success`, `/auth/error` — **muda na Fase 3** |

### Navegação

| ID | Camada | Comportamento atual |
|---|---|---|
| C-NAV-01 | E2E | Abas das empresas ordenadas por `code`, seguidas de "Contratos"; a aba ativa vai para `?company=` e sobrevive a recarregar a página |
| C-NAV-02 | E2E | Subabas Dashboard, Vendas, Estoque e Custos, sincronizadas com `?tab=`; padrão "dashboard" |
| C-NAV-03 | E2E | "Configurações" abre o modal de vendedores |
| C-NAV-04 | E2E | Primeiro acesso sem empresas cria Clock Society (A), The Secret (B) e Morfeus (C), cada uma com o vendedor "Site" — **muda na Fase 3** |

### Dashboard

| ID | Camada | Comportamento atual |
|---|---|---|
| C-DASH-01 | UNIT | Custos fixos no período: o mês conta se estiver entre `start_date` e `start_date + qtdmonths − 1`; sem mês selecionado valem os 12 meses do ano; valor negativo reduz o total; custo que atravessa o ano conta só os meses do ano filtrado |
| C-DASH-02 | UNIT | Comissão por vendedor = Σ (total − custos da venda) × % ÷ 100, só vendas concluídas; venda com dois vendedores soma o valor cheio para cada um (achado 9); vendedor inativo entra no total (N12) — **removido na Fase 6** |
| C-DASH-03 | E2E | Os 6 cartões (Receita, Receita Líquida, Comissões, Custos de Vendas, Custos Gerais, Lucro) batem com a tabela esperada em cada período do fixture |
| C-DASH-04 | E2E | Cartões por vendedor: aparecem todos os vendedores ativos da empresa, inclusive sem vendas ("Sem comissão no período") e o "Site"; inativos não aparecem; valores e casas decimais batem com a tabela esperada (N13) |
| C-DASH-05 | UNIT | Intervalos do filtro de mês sob `TZ=America/Sao_Paulo`: incluem o dia 1 e o último dia do mês e nada do mês vizinho |

### Vendas

| ID | Camada | Comportamento atual |
|---|---|---|
| C-SALES-01 | UNIT | Estatísticas: receita, custos e lucro de concluídas e de pendentes; itens vendidos; pagamentos concluídos e pendentes; valor faltante (pago → 0; senão `max(total − entrada, 0)`) |
| C-SALES-02 | E2E | Tabela paginada de 10 em 10, por nº do pedido decrescente, com "1–10 de N vendas" e Anterior/Próximo |
| C-SALES-03 | E2E | Busca por trecho do cliente ou do produto, sem diferenciar maiúsculas, e por nº do pedido; só aplica ao clicar em "Buscar" ou apertar Enter; apagar o texto desfaz a busca |
| C-SALES-04 | E2E | Filtros de mês, status, vendedor (vendedor sem vendas → "Nenhum resultado encontrado.") e "Somente com valor faltante"; todo filtro volta à página 1; "Limpar filtros" restaura tudo; os filtros de mês/ano do topo afetam cartões e tabela |
| C-SALES-05 | E2E | Colunas: produtos agregados de `sale_items`; quantidade = soma dos itens; Custo Total; coluna "Total" = total − custos (N7); Entrada "-" quando zero; Faltante |
| C-SALES-06 | E2E | Ações: "confirmar pagamento" só aparece com entrada ≠ total, pagamento pendente e faltante > 0; alternar concluída ↔ pendente; excluir pede confirmação e remove |
| C-SALES-07 | E2E | Nova venda: nº de pedido repetido na mesma empresa bloqueia com mensagem; sem vendedor bloqueia; aceita vários itens e vários vendedores com %; entrada vazia ou 0 → "Pagamento à vista" e pagamento "pago"; entrada parcial → "pendente"; toast de sucesso |
| C-SALES-08 | E2E | Editar venda carrega itens e vendedores; o valor salvo do "Valor Líquido Total" é o comportamento real apurado em N1 |
| C-SALES-09 | E2E | Detalhes: dados, produtos, custos e resumo; adicionar e excluir custo atualiza o resumo, a tabela e os cartões |
| C-SALES-10 | UNIT | CSV: 14 colunas na ordem atual; BOM; escape de vírgula, aspas e quebra de linha; "Valor Líquido após Comissão"; faltante; datas em DD/MM/AAAA |
| C-SALES-11 | E2E | Exportar respeita todos os filtros ativos, ignora a paginação e baixa `vendas-AAAA-MM-DD.csv`; sem resultado → "Nenhum dado para exportar" |
| C-SALES-12 | UNIT | Formulário: à vista quando a entrada é vazia ou 0; faltante = `max(total − entrada efetiva, 0)`; na edição, o status de pagamento existente é mantido |

### Estoque

| ID | Camada | Comportamento atual |
|---|---|---|
| C-INV-01 | E2E | Cartões Valor Total, Total de Produtos e Quantidade Total |
| C-INV-02 | E2E | Lista ordenada por produto; busca por produto; filtro por localização; "Limpar" |
| C-INV-03 | E2E | Criar, editar (valor total = quantidade × custo unitário) e excluir com confirmação |

### Custos fixos

| ID | Camada | Comportamento atual |
|---|---|---|
| C-FIX-01 | UNIT | Ativo no mês; "Total Mensal Médio" = soma dos ativos no mês corrente; "Total Anual" = valor × meses ativos no ano corrente |
| C-FIX-02 | UNIT | Filtros: busca por nome ou categoria; mês em que está ativo; tipo Fixo/Variável; ordem por data de início |
| C-FIX-03 | E2E | Criar com validação (nome obrigatório; 1 a 12 meses; valor diferente de zero, negativo permitido; data obrigatória) e excluir com confirmação |
| C-FIX-04 | DB | `end_date` preenchido por gatilho a partir de `start_date` e `qtdmonths` (conforme o dump) |

### Contratos

| ID | Camada | Comportamento atual |
|---|---|---|
| C-CON-01 | UNIT | Ativo = sem data de fim ou fim ≥ hoje; total mensal dos ativos; total anual pelos meses ativos no ano corrente |
| C-CON-02 | E2E | Criar e excluir; busca por nome ou descrição; filtro pelo mês de início |

### Configurações (vendedores)

| ID | Camada | Comportamento atual |
|---|---|---|
| C-SET-01 | E2E | Lista os vendedores de todas as empresas; criar, editar, ativar/inativar e excluir com confirmação; o percentual gravado é sempre 0 (achado 10) |
| C-SET-02 | DB | Criar empresa cria o vendedor "Site" (gatilho) |

### Banco

| ID | Camada | Comportamento atual |
|---|---|---|
| C-DB-01 | DB | O dono lê exatamente as contagens do fixture em cada uma das 10 tabelas e nas 2 views |
| C-DB-02 | DB | O dono cria, altera e exclui em todas as tabelas que o front escreve |
| C-DB-03 | DB | Um segundo usuário (T2) não lê nem escreve linhas de T1 nas tabelas que têm RLS |
| C-DB-04 | DB | O que a chave anônima, sem login, consegue ler hoje em cada tabela e view. Onde houver acesso, o caso fica como `test.fails` — **passa a valer na Fase 3** |
| C-DB-05 | DB | Isolamento entre inquilinos em `sales_with_details`, `sales_with_salespersons` e `sale_items` — hoje não garantido (achados 1–3); registrado como `test.fails` — **passa a valer na Fase 3** |
| C-DB-06 | DB | Salvar itens de uma venda: efeito real sobre `sales.total_price` (N1) |

---

## 8. Comportamentos que mudam de propósito depois

Ficam marcados no próprio teste (comentário com o ID do caso que o substitui) e listados no
[contrato de regressão](README.md#4-contrato-de-regressão): C-AUTH-05, C-NAV-04, C-DB-04, C-DB-05 e C-DASH-02.

---

## 9. Critérios de saída

- [ ] Todos os casos C-xx implementados e verdes no CI (os `test.fails` documentados contam como verdes)
- [ ] Cada teste foi visto falhando ao menos uma vez (sabotagem local)
- [ ] Divergências de schema documentadas; baseline versionada; `supabase db reset` reconstrói o banco local do zero
- [ ] Tabela de números esperados revisada por uma segunda pessoa
- [ ] Lista de bugs conhecidos registrada (D-5)
- [ ] Script de retrato pronto e testado contra o banco local
- [ ] Nenhuma mudança visível para o usuário: o diff de código de produção contém só as extrações da §5

---

## 10. Estimativa e corte mínimo

| Bloco | Horas |
|---|---|
| Infra (Vitest, Playwright, Supabase local, CI, ESLint) | 5–6 h |
| Baseline do schema + diff + inventário de políticas e grants (inclui o 1.1 do planejamento) | 2–3 h |
| Fixture + tabela de números esperados | 3–4 h |
| Extrações + testes UNIT | 3–4 h |
| Testes DB | 2 h |
| Testes E2E | 5–7 h |
| **Total** | **20–26 h** |

**Corte mínimo (~12–14 h),** caso o orçamento não comporte tudo: infra sem COMP, baseline, fixture com
tabela esperada, todos os C-DB, e E2E apenas de números e dados — C-DASH-03/04, C-SALES-02, C-SALES-05,
C-SALES-11, C-INV-01, C-NAV-01/02. Os fluxos de formulário ficam para teste manual nas Fases 4 e 6.
O corte preserva o essencial: detectar linha sumida por política errada e número diferente no dashboard.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Dump de produção exige a string de conexão (Q8) | Levantar quem tem acesso antes de começar; o dump é *schema-only* |
| Testes E2E instáveis | Relógio fixo, `TZ` fixo, `supabase db reset` + seed por suíte, sem `waitForTimeout` |
| Fixture virar cópia da lógica | Tabela esperada calculada fora do código, revisada por outra pessoa |
| Baseline divergir de novo por alteração manual no painel | A partir desta fase, alteração de schema só por migration; registrar a regra no `CLAUDE.md` |
| Extração mudar comportamento sem querer | Uma extração por commit, com os testes E2E verdes antes e depois |
