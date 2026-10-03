# Fase 5 — Casos de teste: papel vendedor

**Objetivo:** definir e aprovar os comportamentos do vendedor e dos recursos que só existem por causa dele (gestão de usuários, troca de senha, comissões compartilhadas), antes de implementá-los.
**Depende de:** Fase 4 concluída (Etapa B); Q2, Q4, Q6 e Q10 respondidas. **Libera:** Fase 6.
**Referência:** planejamento §1 (decisões fechadas), §3.3–3.4, §4.4, §7.1, §8 e Anexos B e C.

> **Restrição de segurança:** nenhum teste automatizado toca em banco de dados (Fase 1 §1). O catálogo
> "Banco" abaixo (`V-DB-xx`) é inteiramente **MANUAL** — o vendedor é o segundo papel do sistema, então
> praticamente toda a superfície de RLS nova só pode ser provada com uma sessão real de vendedor contra
> um banco real.

---

## 1. Como esta fase aplica a skill `tdd`

Igual à Fase 2: catálogo, decisões de interface e fixtures aprovados; no código, apenas `it.todo`.
Os ciclos RED→GREEN acontecem na Fase 6.

---

## 2. Respostas necessárias antes de fechar o catálogo

| Questão | Por que bloqueia |
|---|---|
| Q2 — venda compartilhada | Define os números esperados de V-DB-12 e V-UI-06 |
| Q4 — vendedor exporta CSV? | Define V-UI-04 e a permissão `sales.export` |
| Q6 — quem fica sem login | Define os vínculos do fixture e o V-REG-03 |
| Q10 — vendedor inativo no total (N12) e arredondamento (N13) | Define se o admin verá **os mesmos números de hoje** depois da troca para a RPC |

---

## 3. Decisões de interface a fechar

| # | Interface | Proposta |
|---|---|---|
| 3.1 | Colunas de `vendor_sales` | As da §4.4 do planejamento, mais o percentual de comissão **do próprio vendedor** na venda. Nomes de outros vendedores de uma venda compartilhada não ficam visíveis, porque o RLS de `salespersons` só mostra os registros do próprio vendedor. Decidir o que a coluna "Vendedor / Comissão" exibe |
| 3.2 | `commission_summary(p_company_id, p_year, p_months)` | Assinatura e 7 colunas fixas (§4.4); meses 1..12, e o front converte de 0..11; regra de Q2; filtro de ativos e arredondamento conforme Q10 |
| 3.3 | Cartão "comissão do período" do vendedor (4.4) | Vem da linha do próprio vendedor em `commission_summary()`, e não de cálculo no navegador (N9) |
| 3.4 | `sales_with_details` para o vendedor | Recomendação: 0 linhas (condição `is_admin()` na view), para não exibir custos zerados enganosos; o vendedor usa só `vendor_sales` |
| 3.5 | Contrato de `/api/users` | Endpoints, payloads, schemas zod e respostas: 401 sem sessão, 403 não admin, 409 e-mail duplicado, 422 validação; mensagens em PT-BR; limite de requisições |
| 3.6 | `must_change_password` | Vai para as claims do token pelo hook (o middleware não consulta o banco); a troca acontece numa rota de servidor, que limpa a flag e renova a sessão |
| 3.7 | Desativação | `is_active = false` → funções auxiliares negam acesso + bloqueio do login no Auth (`ban_duration` da Admin API); a sessão aberta perde acesso na renovação do token (§7.3) |
| 3.8 | Área do vendedor | Rota própria (ex.: `/vendedor`) ou `/dashboard` com layout por papel; abas Vendas, Comissões e Estoque; seletor de empresa |
| 3.9 | Detalhe da venda para o vendedor (N8) | Sem detalhe (coerente com "sem coluna de ações"), ou um detalhe sem custos — decidir |
| 3.10 | Modo leitura das tabelas | `SalesTable` com propriedades de colunas e ações visíveis; `InventoryTable` com `onEdit`/`onDelete` opcionais e `readOnly` (4.2, 4.6) |

---

## 4. Fixtures adicionais

| Login | Vínculos (`profile_salespersons`) | Serve para |
|---|---|---|
| `vend-a@t1` | Ana (empresa A) | Caso base |
| `vend-ab@t1` | Bruno (A) + Bruno (B) | Multiempresa e seletor |
| `vend-zero@t1` | Registro sem nenhuma venda | Estado vazio |
| `vend-inativo@t1` | Carla (C), perfil desativado | Acesso bloqueado |
| `vend-troca@t1` | Diego (B), `must_change_password = true` | Troca obrigatória |
| — | "Site" sem login | Continua funcionando |

A venda compartilhada do fixture da Fase 1 fica entre Ana e Bruno na empresa A.

> **Implementação (Fase 5):** os logins foram mapeados para os registros que já existem no fixture
> da Fase 1, para não alterar o oráculo — `vend-ab` usa Carla (A + B), `vend-inativo` usa Elis,
> `vend-troca` fica sem vínculo e entra `vend-b` (Bruno, o outro lado da venda compartilhada). Ver
> `docs/fase-5/README.md` §1.

---

## 5. Catálogo V-xx

### Banco (checklist MANUAL — nunca automatizado, nunca executado por este agente)

Nenhum destes casos vira `it.todo`. São executados à mão contra o Supabase local ou de homologação,
por um humano, antes do merge/deploy da fatia correspondente (Fase 6 §2).

| ID | Comportamento |
|---|---|
| V-DB-01 | `sales`: o vendedor lê só as vendas em que consta em `sale_salespersons` (contagem do fixture); a venda compartilhada aparece para os dois |
| V-DB-02 | `sale_items`: só das próprias vendas. `sale_salespersons`: só as **próprias linhas** (ver V-DB-17) |
| V-DB-03 | `sale_costs`: 0 linhas, inclusive das próprias vendas |
| V-DB-04 | `companies`: só as empresas em que atua; `salespersons`: só os próprios registros |
| V-DB-05 | `inventory`: todas as colunas, **inclusive** `unit_cost` e `total_value`, das empresas em que atua; 0 linhas nas demais |
| V-DB-06 | `costs`, `fixed_costs` e `contracts`: 0 linhas |
| V-DB-07 | Escrita negada (insert, update, delete) em todas as tabelas, inclusive nas próprias vendas e no estoque |
| V-DB-08 | `sales_with_details` / `sales_with_salespersons`: conforme a decisão 3.4 — em nenhum caso com custo |
| V-DB-09 | `vendor_sales`: só as vendas dele; o conjunto de colunas é **exatamente** o combinado em 3.1 |
| V-DB-10 | `commission_summary` numa empresa em que atua: o mesmo resultado que o admin recebe; uma linha por vendedor; colunas exatamente as 7 da §4.4 (sem id de venda, cliente ou produto) |
| V-DB-11 | `commission_summary` numa empresa em que não atua → erro `42501`; admin de outro inquilino → `42501` |
| V-DB-12 | `commission_summary` reproduz os números da Fase 1 (C-DASH-04) em cada período do fixture, com as regras de Q2 e Q10 |
| V-DB-13 | O token do vendedor traz `app_role = vendedor`, o `tenant_id` do admin e `must_change_password` |
| V-DB-14 | Perfil desativado: 0 linhas em tudo e RPC negada |
| V-DB-15 | O vendedor não altera o próprio perfil nem `profile_salespersons` ou `role_permissions` (A-DB-12 continua valendo) |
| V-DB-16 | Perfil `vendedor` sem vínculo continua sem acesso a nada (A-DB-08 continua valendo) |
| V-DB-17 | Em venda compartilhada, o vendedor **não** lê a linha do colega em `sale_salespersons` (nem o `commission_percent` dele), nem pela API nem pelas views. Produção tem 37 vendas compartilhadas (revisão de 28/09/2026, item 6) |

> **Notas da revisão de 28/09/2026 (dados de produção):**
> - **"Pago" × "concluída" (item 7):** a view `salesperson_summary` e a função
>   `salesperson_summary_by_months` (mortas: o app não as usa) só contam vendas pagas; o
>   Dashboard (C-DASH-02) conta toda venda concluída. São 9 vendas concluídas e não pagas, cerca de
>   1,9% do valor concluído. A regra da `commission_summary()` precisa ser fechada em Q2/Q10 **antes**
>   de escrever o V-DB-12.
> - **Coluna legada `sales.salesperson_id` (item 8):** o escopo do vendedor usa só
>   `sale_salespersons`; a coluna legada é ignorada. Em 2 vendas ela aponta para um vendedor que não
>   está vinculado em `sale_salespersons` (bug conhecido nº 6, `docs/known-bugs-fase-1.md`).
> - N12 (vendedor inativo com venda) não ocorre hoje em produção: os 18 vendedores estão ativos. O
>   fixture continua cobrindo o caso.

### API de usuários

| ID | Comportamento |
|---|---|
| V-API-01 | O admin cria um vendedor com nome, e-mail, senha temporária, papel e vínculos (registro existente ou novo em `salespersons`); o perfil nasce com `must_change_password` |
| V-API-02 | Sem sessão → 401; vendedor → 403 — em todos os endpoints |
| V-API-03 | E-mail duplicado → 409; payload inválido → 422; mensagens em PT-BR |
| V-API-04 | Vincular registro que já tem login → erro antes de chegar ao banco |
| V-API-05 | Desativar e reativar; resetar a senha reativa `must_change_password` |
| V-API-06 | A chave `service_role` não aparece em nenhum arquivo servido ao navegador (`.next/static`) — UNIT/CI: grep sobre o output do `next build`, sem abrir servidor nem banco nenhum |

### Middleware e rotas

| ID | Comportamento |
|---|---|
| V-MW-01 | O vendedor entra e cai na área do vendedor |
| V-MW-02 | Com `must_change_password`, qualquer rota leva à troca de senha, sem escapatória por URL; depois da troca, o acesso segue normal |
| V-MW-03 | Custos, Contratos, Configurações e Usuários, por URL ou `?tab=`, mostram acesso negado ao vendedor |
| V-MW-04 | Usuário desativado não consegue entrar |

### Telas

| ID | Comportamento |
|---|---|
| V-UI-01 | Navegação: [empresas em que atua] → Vendas, Comissões e Estoque; sem os cartões de visão geral |
| V-UI-02 | Seletor de empresa para quem atua em mais de uma |
| V-UI-03 | Sem vínculo, ou vínculo sem vendas: estado vazio, sem erro |
| V-UI-04 | Vendas: só as dele; sem "Custo Total", sem a coluna líquida (N7), sem coluna de ações; filtros, busca e paginação funcionam no subconjunto; exportação conforme Q4 |
| V-UI-05 | Cartões da aba Vendas: nº de vendas, valor vendido e comissão do período (3.3) |
| V-UI-06 | Comissões: os mesmos cartões e números que o admin vê para a mesma empresa e período (duas sessões no mesmo teste) |
| V-UI-07 | Estoque: todas as colunas, inclusive custo; cartões de resumo; sem "Novo Item", sem ações e sem formulário |
| V-UI-08 | Troca de senha: regras mínimas e mensagens em PT-BR |
| V-UI-09 | *(Admin)* Usuários: listar, criar, editar, desativar e resetar senha; aviso ao vincular registro sem vendas; Configurações indica quais vendedores têm login |

### Regressão do admin

| ID | Comportamento |
|---|---|
| V-REG-01 | O dashboard do admin, agora alimentado pela RPC, mostra os números da Fase 1 (C-DASH-03/04), respeitadas as decisões de Q2 e Q10 |
| V-REG-02 | Suítes das Fases 1 e 3 verdes depois da extração do motor de vendas (4.1), com o CSV idêntico byte a byte |
| V-REG-03 | O registro "Site" continua funcionando sem login |

---

## 6. Cobertura do §8 do planejamento

| Seção do planejamento | Coberta por |
|---|---|
| §8.1 — tela × papel | V-MW-01/03, V-UI-01 a 07; lado do admin: suíte da Fase 1 |
| §8.2 — testes negativos | V-DB-01 a 11 (MANUAL), V-API-02 (automatizado) |
| §8.3 — validação de política isolada | V-DB-* (MANUAL — mesmo resultado, pelo caminho do PostgREST, mas executado à mão) |
| §8.4 — cenários de vínculo | Fixture da §4 + V-UI-02/03, V-API-04, V-DB-01, V-REG-03, V-MW-04 |
| §8.5 — regressão do admin | A-REG-01, V-REG-01/02 |

---

## 7. Critérios de saída

- [ ] Q2, Q4, Q6 e Q10 respondidas e registradas
- [ ] Decisões 3.1 a 3.10 fechadas
- [ ] Fixture da §4 no seed
- [ ] `it.todo` de todos os V-xx automatizáveis (UNIT/E2E) nos arquivos de teste
- [ ] Checklist MANUAL redigido com os V-DB-xx
- [ ] Catálogo aprovado por pelo menos um revisor além do autor

**Estimativa:** 4–6 h.
