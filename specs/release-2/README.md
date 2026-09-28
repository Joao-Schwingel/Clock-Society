# Release 2 — Papéis admin e vendedor: plano em fases

**Requisitos e arquitetura:** [`../planejamento.md`](../planejamento.md) — define *o quê* e *como* (decisões, DDL, políticas, armadilhas).
**Este diretório:** define *em que ordem* o plano é executado, *o que prova* cada etapa e *quais portões* precisam ser vencidos.
**Status:** proposta para revisão — 19/09/2026

---

## Índice

1. [Por que dividir assim](#1-por-que-dividir-assim)
2. [Visão geral das fases](#2-visão-geral-das-fases)
3. [Como as fases usam a skill `tdd`](#3-como-as-fases-usam-a-skill-tdd)
4. [Contrato de regressão](#4-contrato-de-regressão)
5. [Mudanças em relação ao planejamento](#5-mudanças-em-relação-ao-planejamento)
6. [Horas: redistribuição e esforço novo](#6-horas-redistribuição-e-esforço-novo)
7. [Novos achados da análise](#7-novos-achados-da-análise)
8. [Ação imediata recomendada](#8-ação-imediata-recomendada)
9. [Decisões para a revisão](#9-decisões-para-a-revisão)
10. [Questões em aberto](#10-questões-em-aberto)

Documentos por fase:

| Fase | Documento |
|---|---|
| 1 | [Rede de testes sobre o sistema atual](fase-1-rede-de-testes.md) |
| 2 | [Casos de teste — papel admin](fase-2-casos-de-teste-admin.md) |
| 3 | [Implementação — papel admin](fase-3-implementacao-admin.md) |
| 4 | [Teste manual do admin (portão)](fase-4-teste-manual-admin.md) |
| 5 | [Casos de teste — papel vendedor](fase-5-casos-de-teste-vendedor.md) |
| 6 | [Implementação — papel vendedor](fase-6-implementacao-vendedor.md) |

---

## 1. Por que dividir assim

Três características do sistema atual definem a ordem:

1. **Não existe nenhum teste automatizado**, nem ferramenta de teste instalada (achado N2). Hoje toda mudança é conferida à mão.
2. **O RLS é a única fronteira de segurança** (planejamento §2.1), e **uma política errada não gera erro**: a linha simplesmente some (§7.6). Só um teste que compara contagens esperadas percebe.
3. **O schema do repositório não é o do banco** (achado 4, N1, N5). Sem reconciliar os dois, não dá nem para montar um banco de teste confiável.

Por isso a primeira fase não entrega funcionalidade nenhuma. Ela fixa em testes o comportamento atual. Depois, cada papel entra em dois tempos: primeiro os casos de teste são definidos e aprovados, depois são implementados, um de cada vez.

> **Restrição de segurança (adicionada após a primeira revisão):** nenhum teste automatizado, nem comando executado por um agente de IA, toca em banco de dados — nem local, nem de homologação, nem de produção. Comandos de `DROP`/`DELETE`/`TRUNCATE`/reset de banco estão bloqueados nas permissões do Claude Code deste repositório (`.claude/settings.json`). Consequência direta no ponto 2 acima: "só um teste que compara contagens esperadas percebe" deixa de ser um teste automatizado — a verificação de RLS, grants e views vira um checklist **MANUAL**, executado por um humano contra o Supabase local ou de homologação. Ver [Fase 1 §1 e §2](fase-1-rede-de-testes.md#1-ponto-de-partida) para o detalhe e o trade-off aceito.

---

## 2. Visão geral das fases

```
 Fase 1              Fase 2              Fase 3              Fase 4
 Rede de testes ───► Casos de teste ───► Implementação ───► Teste manual ──┐
 (sistema atual)     admin               admin               admin (portão)│
                                                                           │
 ┌─────────────────────────────────────────────────────────────────────────┘
 │
 └─► Fase 5              Fase 6
     Casos de teste ───► Implementação vendedor
     vendedor            + homologação final (portão)
```

| Fase | Objetivo | Entregável principal | Portão de saída |
|---|---|---|---|
| **1** | Fixar o comportamento atual | Suítes unit/DB/E2E verdes no CI; schema real versionado; fixture com números esperados | Inventário C-xx 100% coberto; nada mudou para o usuário |
| **2** | Definir o que "suportar o admin" significa | Catálogo A-xx aprovado; decisões de interface; fixtures multi-papel | Catálogo revisado e aprovado pelo time |
| **3** | Sistema com papéis, tendo o admin como único papel funcional | Migrations 012–015, 017, 018; camada de permissão; middleware por papel | A-xx verdes; suíte da Fase 1 verde (salvo as exceções da §4) |
| **4** | Validar em homologação e produção | Checklist executado e registrado | Números do admin idênticos ao retrato; nenhuma pendência |
| **5** | Definir o comportamento do vendedor | Catálogo V-xx aprovado; contratos de API, RPC e view | Q2, Q4 e Q6 respondidas; catálogo aprovado |
| **6** | Área do vendedor e gestão de usuários | Migration 016; ramo do vendedor nas políticas; telas novas | V-xx verdes; matriz manual do §8 executada |

**Estado do sistema ao fim de cada fase:**

| Após | Admin | Vendedor | Produção |
|---|---|---|---|
| Fase 1 | Igual a hoje | Não existe | Sem mudança (só testes e extrações mecânicas) |
| Fase 3/4 | Igual a hoje, agora sobre `profiles` + claims + políticas por papel | Um login com papel `vendedor` **não enxerga nada** (nega por padrão) | Brechas 1–3 fechadas; auto-cadastro fechado |
| Fase 6 | Igual a hoje + tela de Usuários; comissões vindas da RPC | Área do vendedor completa | Entrega final |

---

## 3. Como as fases usam a skill `tdd`

- **A Fase 1 não é TDD.** O código já existe, então os testes são de *caracterização*: descrevem o que o sistema faz hoje, certo ou errado. Como passam de primeira, cada teste precisa ser visto falhando pelo menos uma vez (sabotar o código localmente e confirmar que o teste acusa).
- **As Fases 2 e 5 são a etapa de _Planning_ da skill:** confirmar as mudanças de interface, priorizar comportamentos, desenhar interfaces testáveis, listar os comportamentos e obter aprovação. Os casos automatizáveis (UNIT/E2E) chegam ao código apenas como `it.todo("A-MW-01 …")`, sem asserções; os casos MANUAL (`A-DB-xx`/`V-DB-xx`) entram como linhas de um checklist, sem execução ainda.
- **As Fases 3 e 6 são os ciclos RED→GREEN**, um comportamento do catálogo por vez: escrever o teste, vê-lo falhar, implementar o mínimo, vê-lo passar, seguir para o próximo. Refatoração só com tudo verde.

> Escrever todas as asserções nas Fases 2 e 5 e só implementar nas Fases 3 e 6 seria o anti-padrão
> *horizontal slicing*, que a própria skill proíbe: testes escritos em lote testam comportamento
> imaginado. Por isso as fases de "casos de teste" entregam o **catálogo aprovado**, e os testes
> executáveis nascem junto com a implementação.

---

## 4. Contrato de regressão

A suíte da Fase 1 é o contrato do comportamento atual. Nas Fases 3 e 6, **qualquer teste da Fase 1 que quebrar é regressão**, exceto os listados abaixo, que mudam de propósito:

| Teste | Muda na | Motivo |
|---|---|---|
| C-AUTH-05 — `/auth/sign-up` é rota pública | Fase 3 | Auto-cadastro fechado (achado 6) |
| C-NAV-04 — primeiro acesso cria as 3 empresas | Fase 3 | Auto-criação removida (achado 5, item 2.4) |
| C-DB-04 — acesso da chave anônima (item **MANUAL**, hoje registrado como falha conhecida) | Fase 3 | Grants revisados (item 1.2) — o item MANUAL passa a registrar OK |
| C-DB-05 — isolamento nas views e em `sale_items` (item **MANUAL**, hoje registrado como falha conhecida) | Fase 3 | Brechas fechadas (achados 1–3) — o item MANUAL passa a registrar OK |
| C-DASH-02 — cálculo de comissão no navegador (unit) | Fase 6 | O código é removido (4.5); o equivalente passa a ser V-DB-12. **Os testes E2E dos números (C-DASH-03/04) continuam idênticos** |
| C-DASH-03/04 — números de comissão | Fase 6, **somente se** Q2, N12 ou N13 mudarem a regra | Mudança de regra decidida pelo cliente, não efeito colateral |

---

## 5. Mudanças em relação ao planejamento

O planejamento continua valendo integralmente para decisões, DDL e armadilhas. O que muda é a ordem:

| # | No planejamento | Neste plano | Motivo |
|---|---|---|---|
| 1 | 1.1 (levantamento do schema) abre a Etapa 1 | Passa para a Fase 1 | Sem o schema real não se monta o banco local dos testes |
| 2 | 1.4 reescreve as políticas já com o ramo do vendedor | A Fase 3 escreve só o ramo do admin (nega todo o resto); a Fase 6 acrescenta o ramo do vendedor | Nenhuma política entra sem teste. O que vai para produção na Fase 3 não tem como vazar dado para um vendedor, porque ele não tem acesso a nada |
| 3 | `role_permissions` carregada com os dois papéis | Admin na Fase 3, vendedor na Fase 6 | Idem |
| 4 | 1.5 (`vendor_sales`, `commission_summary()`) na Etapa 1 | Fase 6 | Só existem por causa do vendedor. A troca do dashboard do admin para a RPC fica protegida pelos números da Fase 1 |
| 5 | Etapa 3 (gestão de usuários) e 2.3 (troca de senha) antes da área do vendedor | Fase 6 | Sem o papel vendedor funcionando, criar usuário só gera logins que não enxergam nada; e a chave `service_role` (superfície de ataque nova) entra junto com quem a usa |
| 6 | "Retrato dos números" manual antes da Etapa 1 (nota da §8.5) | Fixture com números esperados (automático) + script de retrato de produção, ambos na Fase 1; o retrato é executado na Fase 4 | Vira oráculo permanente, e não só uma foto |
| 7 | Etapa 5.1 — matriz manual ao final | Parte automatizável (§8.2, §8.3) entra nos catálogos A-xx/V-xx; o restante é manual nas Fases 4 e 6 | Os testes negativos rodam em todo PR, não uma vez |
| 8 | Q3 (homologação) bloqueia 1.4 | Bloqueia a Fase 4 | Os testes automáticos rodam no Supabase local; a homologação continua necessária para o teste manual |
| 9 | 4.1 (extração do motor de vendas) é o segundo maior risco | Continua na Fase 6, agora coberta pela suíte da Fase 1 | O risco cai: a extração vira refatoração com rede de proteção |

---

## 6. Horas: redistribuição e esforço novo

| Fase | Itens do planejamento | Horas do planejamento | Esforço novo (estimativa) | Total |
|---|---|---|---|---|
| 1 | 1.1 | 1 h | 18–25 h — infra de testes, fixture, caracterização, CI (sem infraestrutura de banco de teste, ver Fase 1 §10) | 19–26 h |
| 2 | — | — | 4–6 h | 4–6 h |
| 3 | 1.2, 1.3, 1.4 (admin), 1.6, 2.1, 2.2, 2.4 | 11,5 h | 4–6 h — testes escritos junto da implementação | 15,5–17,5 h |
| 4 | parte de 5.1 | — | 2–4 h | 2–4 h |
| 5 | — | — | 4–6 h | 4–6 h |
| 6 | 1.4 (vendedor), 1.5, 2.3, Etapa 3, Etapa 4, 5.1–5.3 | 30,5 h | 6–8 h | 36,5–38,5 h |
| **Total** | | **43 h** | **38–54 h** | **81–97 h** |

> O item 1.4 (4 h) foi dividido em 2,5 h para o admin e 1,5 h para o vendedor.
> **As horas novas não constam do `ORCAMENTO-ROLES.md`.** A rede de testes custa quase o mesmo que a
> feature. Se o orçamento não comportar, a Fase 1 tem um corte mínimo (~11–13 h) descrito na
> [§10 do documento dela](fase-1-rede-de-testes.md#10-estimativa-e-corte-mínimo).
> As horas das Fases 3 e 6 também mudam de composição depois da restrição de banco: parte do tempo que
> seria escrever testes DB automatizados vira execução e registro de checklist MANUAL — o total por fase
> não muda de forma relevante, mas o `it.todo` some das tabelas `A-DB-xx`/`V-DB-xx` (ver Fases 2, 3, 5 e 6).

---

## 7. Novos achados da análise

Complementam as seções 2.3 e 2.4 do planejamento.

| # | Achado | Onde | Impacto no plano |
|---|---|---|---|
| N1 | O gatilho `recalc_sale_total` reescreve `sales.total_price` com a soma de `quantity × unit_price` dos itens. O formulário de venda hoje esconde o preço unitário (item novo vai com `0.00`) e grava o "Valor Líquido Total" digitado. Se o gatilho existir como está no script, o valor digitado seria sobrescrito a cada salvamento | `scripts/alteracoes/10_01.sql:13-39`; `sales-form.tsx:55`, `:319`, `:498-513` | Provável divergência de schema (gatilho alterado ou removido só no banco). Confirmar no dump da Fase 1. O caso C-SALES-08 fixa o comportamento real |
| N2 | Nenhuma ferramenta de teste. `pnpm lint` chama o ESLint, que não está instalado. `next.config.mjs` ignora erros de TypeScript no build | `package.json`; `next.config.mjs:3-5` | `tsc --noEmit` passa hoje sem nenhum erro, então dá para exigi-lo no CI desde a Fase 1 |
| N3 | O front usa o id do usuário logado como filtro (`.eq("user_id", userId)`) e como `user_id` nas inserções | Filtros: `dashboard-view.tsx:142`, `fixed-costs-view.tsx:27`, `contracts-view.tsx:24`, `settings-modal.tsx:47`, `sales-form.tsx:154`, `app/dashboard/page.tsx:17`, `:28`. Inserções: `sales-form.tsx:312`, `inventory-form.tsx:57`, `fixed-cost-form.tsx:75`, `contracts-form.tsx:36`, `settings-modal.tsx:73`, `sale-cost-form.tsx:50`, `app/dashboard/page.tsx:22-24` | Com `user_id` virando inquilino (§3.1), todos passam a depender do `tenant_id`. Para o admin atual os valores coincidem, por isso só um teste com outro login do mesmo inquilino detecta o problema (A-DB-11, A-TEN-01) |
| N4 | `DashboardLayout` quebra quando a lista de empresas é vazia | `dashboard-layout.tsx:25` (`companies[0].code`) | Afeta 2.4 (fim da auto-criação) e o vendedor sem vínculo |
| N5 | `companies.code` é `unique` no banco inteiro, não por inquilino | `scripts/001_create_tables.sql:8` | Para um segundo login, a auto-criação falharia por unicidade (erro ignorado) e cairia em N4. Refina o achado 5; confirmar no dump. Também impede que o inquilino de teste T2 use os códigos A/B/C |
| N6 | Ano padrão fixo em `"2026"`; totais de custos fixos e contratos usam a data de hoje; filtros de mês convertem datas locais com `toISOString()` | `dashboard-view.tsx:51`; `sales-view.tsx:50`; `fixed-costs-view.tsx:60`; `contracts-view.tsx:37`; `sales-view.tsx:88-95`, `:157-165` | Testes rodam com relógio fixo e `TZ=America/Sao_Paulo`. Em fuso positivo os filtros deslocam um dia |
| N7 | A coluna rotulada "Total" na tabela de vendas mostra `total_price − custos` | `sales-table.tsx:346`, `:436` | É o "total líquido" que o planejamento manda ocultar do vendedor (4.2). Os testes devem identificá-la pelo valor, não pelo rótulo |
| N8 | O detalhe da venda (ícone de olho) fica dentro da coluna de ações e mostra os custos | `sales-table.tsx:476-482`; `sale-details-modal.tsx:311-404` | Com "sem coluna de ações" (§8.1), o vendedor fica sem tela de detalhe. Confirmar na Fase 5 se é intencional |
| N9 | O cartão "comissão do período" da aba Vendas do vendedor (4.4) não pode ser calculado no navegador, porque a comissão depende de `sale_costs`, que o vendedor não lê | planejamento 4.4 | Tem que vir da linha do próprio vendedor em `commission_summary()` |
| N10 | O middleware obtém o usuário com `auth.getUser()`, que devolve o registro do usuário, e não as claims que o hook injeta no token | `lib/supabase/middleware.ts:33-35` | Para ler `app_role`/`tenant_id` sem consultar o banco (2.2), o middleware precisa ler as claims do access token. Coberto por A-MW-02 |
| N11 | Não existem rotas por aba: tudo acontece em `/dashboard`, com `?company=` e `?tab=` | `dashboard-layout.tsx:25`; `company-dashboard.tsx:17` | O "403 por rota" do §8.1 para Custos, Contratos e Configurações é, na prática, bloqueio de aba pelo `nav-registry` (A-PERM-05). O middleware só separa áreas inteiras |
| N12 | `commission_summary()` só considera vendedores ativos (`sp.is_active`), mas o cartão "Comissões" de hoje soma a comissão de **todos** os vendedores das vendas, inclusive inativos (a lista de cartões por vendedor é que mostra só os ativos) | planejamento §4.4; `dashboard-view.tsx:131-137` × `:180-205` | Se o cartão passar a somar a RPC (4.5), "Comissões" e "Lucro" mudam sempre que houver venda de vendedor inativo no período. O fixture inclui esse caso (C-DASH-03); a regra precisa ser decidida na Fase 5 |
| N13 | O front não arredonda a comissão e a exibe com até 3 casas decimais (`toLocaleString` com `minimumFractionDigits: 2` deixa o máximo em 3); a RPC arredonda o total para 2 casas | `dashboard-view.tsx:221-222`; planejamento §4.4 | "Mesmos números" (§10, Etapa 4) pode falhar por arredondamento. Decidir na Fase 5; o fixture inclui percentual que gera 3+ casas |

---

## 8. Ação imediata recomendada

Independe das fases, não exige código e pode ser feita antes da Fase 1:

1. **Painel do Supabase → Authentication:** conferir se o cadastro de novos usuários está habilitado e, se estiver, desabilitar. O item já consta em 1.3; a recomendação é só antecipá-lo.
2. **Conferir o que a chave pública (anon), sem login, consegue ler** nas views `sales_with_details` / `sales_with_salespersons` e em `sale_items`. Se ler qualquer coisa, antecipar a parte de grants do item 1.2 (revogar `anon`), que não afeta o app: todas as consultas dele rodam como `authenticated`.

Os dois reduzem a exposição dos achados 1–3 enquanto a Fase 3 não chega.

---

## 9. Decisões para a revisão

| # | Decisão | Recomendação | Alternativa |
|---|---|---|---|
| D-1 | Ferramentas de teste | Vitest (unit), Playwright (E2E, com rede mockada via `page.route()`). Supabase CLI local (Docker) só é usado por quem executa o checklist MANUAL — nunca pelo CI, nunca por este agente | Jest; Cypress |
| D-2 | Como testar RLS | **Revisado:** nenhum teste automatizado pode autenticar contra um banco real. RLS, grants e views viram um checklist **MANUAL** (Fase 1 §2/§7), executado por um humano contra o Supabase local ou de homologação | *(rejeitada pela restrição de banco)* Vitest + `supabase-js` contra o PostgREST local — era a recomendação original: o mesmo caminho do navegador, pegando grant faltando, view ignorando RLS e política errada de uma vez. pgTAP (`supabase test db`) tem a mesma limitação: ainda é um teste tocando banco |
| D-3 | Onde vivem as migrations | **Decidido (Fase 2):** continuar em `scripts/`, com arquivos numerados e o par de rollback em `scripts/rollback/` — é o que o `CLAUDE.md` já determina e o que o repositório usa | *(descartada)* `supabase/migrations/` como fonte única |
| D-4 | Refatoração na Fase 1 | Só extrações mecânicas de funções puras, uma por commit, sem mudar lógica (lista na Fase 1 §5) | Nenhuma extração; testar tudo via E2E (mais lento e frágil) |
| D-5 | Bugs achados na Fase 1 | Fixar o comportamento atual no teste e registrar o bug; corrigir fora desta release, salvo segurança | Corrigir na hora (mistura mudança de comportamento com a rede de proteção) |
| D-6 | Política na Fase 3 | Nega por padrão: só o admin do inquilino acessa; o ramo do vendedor entra na Fase 6 | Escrever já as políticas finais (ramo do vendedor sem teste até a Fase 6) |
| D-7 | Gestão de usuários e troca de senha | Fase 6 | Fase 3 (a tela de Usuários é do admin) |
| D-8 | `commission_summary()` e dashboard do admin na RPC | Fase 6 | Fase 3 (resolve os achados 8/9 mais cedo, mas aumenta o risco da Fase 3) |
| D-9 | Meta de cobertura | Todo item dos inventários C/A/V tem pelo menos um teste; % de linhas só como informação | Meta de % de linhas |
| D-10 | `pnpm lint` quebrado (N2) | Instalar ESLint com `eslint-config-next` na Fase 1 e rodar no CI | Remover o script |
| D-11 | Onde guardar o retrato de produção e evidências da Fase 4 | Fora do repositório — o repositório é **público** e os dados são financeiros e têm nomes de clientes | — |

---

## 10. Questões em aberto

| # | Questão | Bloqueia | Padrão se não houver resposta |
|---|---|---|---|
| Q2 | Venda compartilhada conta integralmente para os dois vendedores? (planejamento) | Fase 5 (números esperados de comissão) | Manter o comportamento atual |
| Q3 | Existe um segundo projeto Supabase para homologação? (planejamento) | **Fase 4** | Sem homologação, não implantar a Fase 3. +1 h para criar |
| Q4 | Vendedor exporta CSV? (planejamento) | Fase 5 | Não exporta |
| Q5 | Quantos vendedores no primeiro ano? (planejamento) | Fase 6 (6.9) | Até 20 |
| Q6 | Algum vendedor atual fica sem login? (planejamento) | Fase 5 | `Site` fica; confirmar os demais |
| Q7 | Haverá mais de um admin? | Fase 2 (A-DB-11, A-TEN-01) | Testar mesmo assim: é o único detector de N3 |
| Q8 | Quem tem acesso à string de conexão de produção para o dump da Fase 1? | Fase 1 | — |
| Q9 | Docker disponível nas máquinas de quem for executar o checklist MANUAL? Não é mais necessário no CI (nenhuma etapa do pipeline sobe banco de dados) | Fase 1 | Levantar por pessoa, conforme for executar o checklist |
| Q10 | Venda de vendedor inativo entra no total de comissões (N12)? E arredondamento: 2 casas no total ou exibir como hoje (N13)? **E a comissão conta toda venda concluída (como o Dashboard) ou só as pagas (como a view e a função antigas do banco)?** Diferença hoje: 9 vendas, cerca de 1,9% do valor | Fase 5 | Manter o comportamento atual do Dashboard (toda concluída) e adaptar a RPC a ele |
