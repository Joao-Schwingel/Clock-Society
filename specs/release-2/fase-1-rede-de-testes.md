# Fase 1 — Rede de testes sobre o sistema atual

**Objetivo:** fixar em testes automatizados o comportamento atual do sistema (monousuário) antes de qualquer mudança de permissão.
**Regra da fase:** nenhuma mudança de comportamento. As únicas alterações de código de produção permitidas são as extrações mecânicas da §5.
**Restrição de segurança (nova):** nenhum teste automatizado toca em banco de dados — nem local, nem de homologação, nem de produção. Nenhuma etapa do CI abre conexão com um banco. Comandos de `DROP`/`DELETE`/`TRUNCATE`/reset de banco (Supabase CLI, Prisma, psql ou qualquer outra ferramenta) estão bloqueados nas permissões do Claude Code para este projeto (`.claude/settings.json`), além de proibidos por este documento.
**Depende de:** nada. **Libera:** Fase 2.

---

## 1. Ponto de partida

- Nenhum teste e nenhuma ferramenta de teste no repositório; `pnpm lint` falha porque o ESLint não está instalado (N2).
- A lógica de negócio vive dentro dos componentes (`dashboard-view.tsx`, `sales-view.tsx`, …), e as consultas saem direto do navegador.
- O schema dos scripts divergiu do banco (achado 4, N1, N5). A view `sales_with_salespersons`, usada pelo dashboard, nem está versionada.
- Parte do comportamento depende do relógio e do fuso (N6).

Por isso a rede tem camadas diferentes, cada uma cobrindo o que as outras não alcançam.

> **Trade-off aceito com a restrição de segurança:** sem nenhum banco de teste (nem local, nem efêmero), a verificação de RLS, grants e views (achados 1–3, os motivadores originais desta fase) deixa de ser automatizada. Ela vira um checklist **MANUAL** (§7), executado por um humano contra o Supabase local ou de homologação — nunca em CI, nunca por este agente. É uma perda real de cobertura automatizada de segurança, registrada como risco em §11, em troca da garantia de que nenhum teste ou comando de IA apaga dado nenhum.

---

## 2. Estratégia em camadas

| Camada | Ferramenta | Cobre | Roda contra |
|---|---|---|---|
| **UNIT** | Vitest (node) | Regras de cálculo e de filtro extraídas dos componentes (§5) | — |
| **E2E** | Playwright (Chromium) | Telas completas do jeito que o admin usa: números, filtros, formulários, exportação | `next dev` + respostas do PostgREST/Auth **mockadas** via interceptação de rede (`page.route()`) — nenhum banco, nem local nem remoto |
| **COMP** *(opcional)* | Vitest + Testing Library + MSW | Estados difíceis de provocar via E2E (erro de rede, carregando) | — nunca toca banco |
| **MANUAL** | Checklist humano (SQL Editor / painel do Supabase) | RLS, grants, views e gatilhos (achados 1–3) | Supabase local ou de homologação — nunca produção, nunca automatizado, nunca executado por este agente |

**Por que E2E com rede mockada, e não contra um banco real — nem local (D-2 revisado):** a versão anterior deste documento testava a camada DB e o E2E contra um Supabase local via Docker, autenticando com JWT de usuário real, exatamente para pegar de uma vez grant faltando, view ignorando RLS e política errada (achados 1–3) pelo mesmo caminho do navegador. Isso deixou de ser permitido: nenhum teste pode escrever, apagar ou resetar linhas de um banco, nem um Postgres local descartável. O Playwright passa a interceptar as chamadas HTTP do Supabase e responder com fixtures JSON gravadas no formato real (mesmas colunas do dump da §1.1). Isso preserva o valor de "testar pela tela real" — números, filtros, paginação, exportação continuam sendo o contrato de regressão — mas sem abrir nenhuma conexão com um banco.

**Consequência para os casos que escrevem (criar/editar/excluir):** como a rede é mockada, esses casos E2E (C-SALES-06/07/08, C-FIX-03, C-CON-02, C-INV-03, C-SET-01) passam a verificar que a tela manda a requisição certa e reage certo à resposta simulada de sucesso — **não** que o dado realmente persiste no Postgres. A persistência real continua sendo verificada à mão, na Fase 4 (planejamento §8.5, teste manual de regressão do admin).

---

## 3. Infraestrutura (entregáveis)

- [ ] Vitest com `TZ=America/Sao_Paulo` e relógio fixo (`vi.setSystemTime`)
- [ ] Playwright (Chromium) com relógio fixo (`page.clock`), `webServer` subindo `next dev` **sem nenhum banco de dados conectado** — toda chamada ao Supabase interceptada via `page.route()`
- [ ] Camada de fixtures de resposta do PostgREST/Auth (JSON), uma por cenário do inventário (§4), reconciliadas com o schema real levantado em 1.1 para não divergir do formato de produção
- [ ] **Baseline do schema (item 1.1 do planejamento) — tarefa manual, somente leitura, fora da suíte de testes e fora do CI:**
  - [ ] dump *schema-only* do projeto de produção (`public`, e as partes relevantes de `auth`: gatilhos e funções)
  - [ ] diff contra `scripts/*.sql`, com toda divergência documentada — no mínimo: colunas do achado 4, `sale_salespersons`, `sales_with_salespersons`, gatilho `recalc_sale_total` (N1), unicidade de `companies.code` (N5), gatilho de `end_date` em `fixed_costs`
  - [ ] inventário das políticas: `select * from pg_policies where schemaname = 'public'`, salvo como linha de base do rollback
  - [ ] inventário de grants por papel (`anon`, `authenticated`) em tabelas e views
  - [ ] baseline versionada como documentação de referência — não como migration aplicada por CI; nenhuma etapa automatizada roda DDL contra banco nenhum
- [ ] Fixture sintético (§4) em JSON — **nunca dados reais, nunca inserido em um banco**
- [ ] Scripts `pnpm`: `test` (unit), `test:e2e`, `typecheck` (`tsc --noEmit`)
- [ ] ESLint com `eslint-config-next`, ou remoção do script (D-10)
- [ ] CI no GitHub Actions: `typecheck` → `lint` → unit → build → E2E — nenhuma etapa sobe banco de dados, Docker de Postgres ou `supabase start`
- [ ] Script de retrato de produção (§6) — roda fora do CI, manual, somente leitura
- [ ] Checklist MANUAL (§7, camada MANUAL) documentado e pronto para ser executado por um humano antes de cada janela de deploy das Fases 3 e 6

---

## 4. Fixture — dataset de teste

O fixture é o mesmo em todas as fases e cresce nas Fases 2 e 5. Como nenhum teste automatizado toca um banco, o fixture aqui é um **conjunto de arquivos JSON** (não um seed SQL) que descreve o estado esperado — usado de duas formas:

1. como corpo das respostas mockadas do PostgREST/Auth no Playwright (§2);
2. como entrada da tabela de números esperados, calculada à mão.

Nesta fase ele precisa cobrir:

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

Os casos marcados como usuário/isolamento entre inquilinos (`outro@t2`) e os do item "Banco" de §7 não têm mais como ser exercitados por um teste automatizado (não há banco para autenticar dois usuários reais e comparar linhas visíveis) — eles migram para o checklist **MANUAL** de §7 e continuam fazendo parte do fixture como cenário de referência para quem executa o checklist à mão.

**Relógio dos testes:** 15/09/2026 12:00 (−03:00). Dados em 2025 e 2026 (o ano padrão das telas é 2026, N6).

**Tabela de números esperados (entregável):** para cada empresa × período (2026 inteiro; set/2026;
jan+mar/2026; um mês sem vendas; 2025 inteiro), os valores de todos os cartões do Dashboard, dos
cartões por vendedor, dos cartões da aba Vendas, de Estoque, de Custos e de Contratos. **Calculada à
mão (planilha), a partir dos mesmos arquivos JSON do fixture, sem olhar o código.** Ela é o oráculo:

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

Nenhuma destas extrações lê ou escreve banco — são funções puras sobre dados já carregados. A restrição de segurança desta fase não afeta a §5.

---

## 6. Retrato dos números de produção

Substitui a "foto" manual da nota do §8.5 do planejamento. É executado na Fase 4, imediatamente antes
e imediatamente depois da janela de implantação — **manualmente, por um humano, nunca por este agente e nunca dentro do CI ou da suíte de testes.**

- [ ] Consulta SQL **somente leitura** com agregados por empresa × mês (2025–2026): nº de vendas por status, soma de `total_price`, soma dos custos de venda, nº de itens, comissão por vendedor pela regra atual (C-DASH-02) e contagem de linhas por tabela
- [ ] Roteiro de exportação do CSV da aba Vendas de cada empresa, sem filtro, pela própria tela — permite um diff linha a linha antes/depois
- [ ] **Resultados guardados fora do repositório** (D-11): o repositório é público, e os dados são financeiros e trazem nomes de clientes
- [ ] Executar com uma credencial/role só de leitura, quando disponível, para reforçar por permissão do próprio banco que o roteiro não pode escrever nada

---

## 7. Inventário de comportamentos (casos de caracterização)

> **Nota sobre a camada E2E:** como o Playwright roda contra respostas mockadas (§2), os casos abaixo que envolvem criar, editar ou excluir (C-SALES-06/07/08, C-FIX-03, C-CON-02, C-INV-03, C-SET-01) verificam a requisição enviada e a reação da tela a uma resposta de sucesso simulada — não a persistência real no Postgres. Persistência real é coberta pelo teste manual da Fase 4.
>
> **Nota sobre a camada MANUAL:** os casos marcados **MANUAL** não têm teste automatizado. São um checklist executado à mão contra o Supabase local ou de homologação, por um humano, antes de cada deploy relevante das Fases 3 e 6. Não bloqueiam o CI, mas bloqueiam a saída da própria fase (§9) e das fases que dependem de política de banco.

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
| C-SALES-06 | E2E | Ações: "confirmar pagamento" só aparece com entrada ≠ total, pagamento pendente e faltante > 0; alternar concluída ↔ pendente; excluir pede confirmação e envia a requisição de exclusão |
| C-SALES-07 | E2E | Nova venda: nº de pedido repetido na mesma empresa bloqueia com mensagem; sem vendedor bloqueia; aceita vários itens e vários vendedores com %; entrada vazia ou 0 → "Pagamento à vista" e pagamento "pago"; entrada parcial → "pendente"; toast de sucesso |
| C-SALES-08 | E2E | Editar venda carrega itens e vendedores; o valor salvo do "Valor Líquido Total" é o comportamento real apurado em N1 (a verificação de que o gatilho `recalc_sale_total` não sobrescreve o valor é MANUAL, §7 "Banco") |
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
| C-FIX-04 | MANUAL | `end_date` preenchido por gatilho a partir de `start_date` e `qtdmonths` (conforme o dump) |

### Contratos

| ID | Camada | Comportamento atual |
|---|---|---|
| C-CON-01 | UNIT | Ativo = sem data de fim ou fim ≥ hoje; total mensal dos ativos; total anual pelos meses ativos no ano corrente |
| C-CON-02 | E2E | Criar e excluir; busca por nome ou descrição; filtro pelo mês de início |

### Configurações (vendedores)

| ID | Camada | Comportamento atual |
|---|---|---|
| C-SET-01 | E2E | Lista os vendedores de todas as empresas; criar, editar, ativar/inativar e excluir com confirmação; o percentual gravado é sempre 0 (achado 10) |
| C-SET-02 | MANUAL | Criar empresa cria o vendedor "Site" (gatilho) |

### Banco (checklist MANUAL — nunca automatizado, nunca executado por este agente)

| ID | Camada | Comportamento a verificar |
|---|---|---|
| C-DB-01 | MANUAL | O dono lê exatamente as contagens do fixture em cada uma das 10 tabelas e nas 2 views |
| C-DB-02 | MANUAL | O dono cria, altera e exclui em todas as tabelas que o front escreve (executado à mão pelo humano, contra um Supabase local ou de homologação descartável — nunca por este agente) |
| C-DB-03 | MANUAL | Um segundo usuário (T2) não lê nem escreve linhas de T1 nas tabelas que têm RLS |
| C-DB-04 | MANUAL | O que a chave anônima, sem login, consegue ler hoje em cada tabela e view. Onde houver acesso, fica registrado como falha conhecida — **passa a valer na Fase 3** |
| C-DB-05 | MANUAL | Isolamento entre inquilinos em `sales_with_details`, `sales_with_salespersons` e `sale_items` — hoje não garantido (achados 1–3); registrado como falha conhecida — **passa a valer na Fase 3** |
| C-DB-06 | MANUAL | Salvar itens de uma venda: efeito real sobre `sales.total_price` (N1) |

---

## 8. Comportamentos que mudam de propósito depois

Ficam marcados no próprio teste, ou no checklist MANUAL, com um comentário/anotação referenciando o ID
do caso que o substitui, e listados no [contrato de regressão](README.md#4-contrato-de-regressão):
C-AUTH-05, C-NAV-04, C-DB-04 (MANUAL), C-DB-05 (MANUAL) e C-DASH-02.

---

## 9. Critérios de saída

- [ ] Todos os casos C-xx das camadas UNIT/E2E/COMP implementados e verdes no CI
- [ ] Todos os casos da camada MANUAL (§7 "Banco", C-FIX-04, C-SET-02) executados ao menos uma vez contra o Supabase local ou de homologação, com resultado registrado por escrito — não bloqueiam o CI, mas bloqueiam a saída desta fase
- [ ] Cada teste automatizado foi visto falhando ao menos uma vez (sabotagem local)
- [ ] Divergências de schema documentadas (baseline manual, §3); nenhuma etapa automatizada aplica DDL ou reconstrói banco algum
- [ ] Tabela de números esperados revisada por uma segunda pessoa
- [ ] Lista de bugs conhecidos registrada (D-5)
- [ ] Script de retrato pronto e testado manualmente uma vez, fora do CI
- [ ] Nenhuma mudança visível para o usuário: o diff de código de produção contém só as extrações da §5
- [ ] Confirmado: nenhum passo do CI, da suíte automatizada ou deste agente abre conexão com um banco de dados; `.claude/settings.json` com a denylist de comandos destrutivos permanece versionado

---

## 10. Estimativa e corte mínimo

| Bloco | Horas |
|---|---|
| Infra (Vitest, Playwright + mock de rede, CI, ESLint) | 4–5 h |
| Baseline do schema — leitura manual, sem infraestrutura de teste (inclui o 1.1 do planejamento) | 2–3 h |
| Fixture (JSON) + tabela de números esperados | 4–5 h |
| Extrações + testes UNIT | 3–4 h |
| Testes E2E (mockado) | 5–7 h |
| Checklist MANUAL de banco — execução e registro (C-DB-01..06, C-FIX-04, C-SET-02) | 1–2 h |
| **Total** | **19–26 h** |

**Corte mínimo (~11–13 h),** caso o orçamento não comporte tudo: infra sem COMP, baseline, fixture com
tabela esperada, checklist MANUAL executado uma vez, e E2E apenas de números e dados — C-DASH-03/04, C-SALES-02, C-SALES-05,
C-SALES-11, C-INV-01, C-NAV-01/02. Os fluxos de formulário ficam para teste manual nas Fases 4 e 6.
O corte preserva o essencial: número diferente no dashboard é pego pelo E2E; linha sumida por política errada é pega pelo checklist MANUAL.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Nenhum teste automatizado cobre RLS/grants/views (achados 1–3) | Checklist **MANUAL** (§7) obrigatório antes de cada deploy das Fases 3 e 6; revisão de código redobrada quando as ~40 políticas forem reescritas |
| Fixture/mock diverge do formato real do PostgREST | Reconciliar as fixtures com o baseline do schema (§1.1) sempre que ele mudar; revisar as fixtures quando a Fase 3/6 alterar colunas expostas |
| Dump de produção exige a string de conexão (Q8) | Levantar quem tem acesso antes de começar; o dump é *schema-only* e roda manualmente, fora de qualquer automação |
| Testes E2E instáveis | Relógio fixo, `TZ` fixo, fixtures determinísticas por cenário (sem estado compartilhado entre testes), sem `waitForTimeout` |
| Fixture virar cópia da lógica | Tabela esperada calculada fora do código, revisada por outra pessoa |
| Baseline divergir de novo por alteração manual no painel | A partir desta fase, alteração de schema só por migration; registrar a regra no `CLAUDE.md` |
| Extração mudar comportamento sem querer | Uma extração por commit, com os testes E2E verdes antes e depois |

---

## 12. Nota de escopo

Esta fase remove a camada DB e a estratégia de E2E-contra-banco-real que a versão anterior deste
documento definia (D-2 do `README.md` e a nota "Q9: Docker disponível" do planejamento), por decisão
explícita: nenhum teste pode tocar em banco de dados, e nenhum comando de deleção/reset de banco pode
ser executado por este agente. `README.md`, `fase-2-casos-de-teste-admin.md`,
`fase-3-implementacao-admin.md`, `fase-4-teste-manual-admin.md`, `fase-5-casos-de-teste-vendedor.md` e
`fase-6-implementacao-vendedor.md` já foram revisados na mesma linha: os catálogos `A-DB-xx`/`V-DB-xx`
viraram checklists **MANUAL**, e os casos que dão para provar sem banco (`A-PERM-01`, `A-BOOT-02`,
`A-MW-02/06`, `V-API-06`) foram reclassificados como UNIT ou E2E mockado.
