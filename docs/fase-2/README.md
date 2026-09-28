# Fase 2 — Entregáveis (casos de teste do papel admin)

Spec: [`specs/release-2/fase-2-casos-de-teste-admin.md`](../../specs/release-2/fase-2-casos-de-teste-admin.md).
Esta fase **não implementa nada**: fecha interfaces, registra os casos como `it.todo`/`test.fixme` e
redige o checklist MANUAL. O código de produção não muda.

**Status:** decisões fechadas (as recomendações da §1 foram aprovadas pelo autor em 28/09/2026).
Falta a aprovação de um segundo revisor (§8 da spec). Os casos já foram implementados na Fase 3,
no mesmo branch — ver [§5](#5-fase-3-implementada).

| Entregável (§7 da spec) | Onde |
|---|---|
| Decisões da §3 | [§1 deste documento](#1-decisões-de-interface-3) |
| Usuários e perfis da §4 | `e2e/fixtures/users.json`, `e2e/fixtures/profiles.json`, `e2e/fixtures/profile_salespersons.json` |
| Helpers `loginAs` e leitura de claims (só MANUAL) | [`scripts/manual/fase-2/`](../../scripts/manual/fase-2/README.md) |
| `it.todo` dos casos UNIT/E2E | [§2 deste documento](#2-rastreabilidade-dos-casos) |
| Checklist MANUAL (A-DB-xx, A-TEN-01) | [`docs/manual-checklists/fase-2-checklist-banco-admin.md`](../manual-checklists/fase-2-checklist-banco-admin.md) |
| Migrations da Fase 3 com rollback | [§3 deste documento](#migrations-da-fase-3) |

---

## 1. Decisões de interface (§3)

| # | Decisão (fechada) | Como ficou na Fase 3 |
|---|---|---|
| 3.1 | As 11 permissões da tabela §3.1 da spec; o admin tem todas. `users.manage` só na Fase 6. `role_permissions` recebe **só as linhas do admin** (D-6) | `lib/auth/permissions.ts` ↔ insert da `scripts/013_create_profiles.sql`; A-PERM-01 compara os dois como texto |
| 3.2 | Sessão `{ userId, tenantId, role, salespersonIds, permissions }`. `userId` só para exibição; nenhum filtro ou insert usa ele (N3) | `lib/auth/session.ts` + `session-provider.tsx`. As permissões derivam do catálogo do front, que é o espelho de `role_permissions` garantido pelo A-PERM-01 — sem consulta extra ao banco. `salespersonIds` é `[]` até a Fase 6 |
| 3.3 | Claims em `app_metadata.app_role`/`app_metadata.tenant_id`; o middleware usa `supabase.auth.getClaims()` | **Verificado:** o `supabase-js` 2.85.0 expõe `getClaims()`. Com JWT assimétrico, valida via JWKS; com HS256, valida com `getUser(token)` e devolve o payload. Por isso o mock dos E2E serve |
| 3.4 | Tabela de decisão como função pura | `lib/auth/route-guard.ts` (`decideRoute`, `homeForRole`). Acréscimo da Fase 3: a `/403` também renova a sessão uma vez e manda para a home quem ganhar papel válido — sem isso, o login com token antigo prendia o admin na `/403` (A-MW-06) |
| 3.5 | `nav-registry` resolve `?tab=`/`?company=` para a aba ou para "acesso negado" | `lib/auth/nav-registry.ts` + `components/access-denied.tsx` |
| 3.6 | `default public.current_tenant_id()` nas **8** tabelas com `user_id` (`sale_items` e `sale_salespersons` não têm a coluna: herdam da venda) + `with check (user_id = current_tenant_id() and is_admin())`; o front não manda `user_id` | `scripts/015_rewrite_policies.sql` |
| 3.7 | "Nenhuma empresa disponível." em PT-BR; nada é criado | `components/dashboard/dashboard-layout.tsx`; auto-create removido de `app/dashboard/page.tsx` |

**Q7** (mais de um admin?) — sem resposta; vale o padrão do README: A-DB-11 e A-TEN-01 ficam como
detectores de N3.

**Outras decisões aprovadas:** E2E no relatório do Playwright (spec §1/§8 ajustadas);
`current_role()` → `current_app_role()` (planejamento §4.2 ajustado); rollback da 018 só remove os
perfis do backfill (planejamento §9 ajustado); migrations em `scripts/` (D-3 ajustado no README).

### Achados desta fase

1. **`current_role` é palavra reservada do SQL.** Sem o schema, resolve para a função embutida do
   Postgres, que devolve o papel do banco (`authenticated`). Renomeada para `current_app_role()`.
   O A-DB-03 e o A-DB-17 confirmam no banco local.
2. **Inserções que mandavam `user_id`:** `contracts-form`, `inventory-form`, `sales-form`,
   `fixed-cost-form`, `sale-cost-form` e `settings-modal` (também no update), mais `costs-form`
   (sem uso, achado 11) e o auto-create de `app/dashboard/page.tsx`. **Filtros por `user_id`:**
   `contracts-view`, `fixed-costs-view`, `dashboard-view` (custos fixos), `sales-form` (lista de
   vendedores), `settings-modal` e `app/dashboard/page.tsx`. Todos removidos na Fase 3.
3. **C-AUTH-05 não tinha teste implementado** na Fase 1; A-MW-03 cobre o caso agora.
4. **Só 8 das 10 tabelas têm `user_id`.** `sale_items` e `sale_salespersons` herdam o acesso da
   venda-mãe.

---

## 2. Rastreabilidade dos casos

Na Fase 2, os casos **UNIT** entraram como `it.todo` (Vitest) e os **E2E** como `test.fixme`
(Playwright). Na Fase 3, todos viraram testes de verdade; não resta nenhum `it.todo`/`test.fixme`
do catálogo.

| ID | Pri. | Camada | Arquivo | Fatia |
|---|---|---|---|---|
| A-DB-01 … A-DB-17 | P1/P2 | MANUAL | `docs/manual-checklists/fase-2-checklist-banco-admin.md` | 3.1–3.3 |
| A-MW-01 … A-MW-06 | P1/P2 | UNIT + E2E (JWT fabricado pelo mock) | `lib/auth/route-guard.test.ts`, `e2e/tests/admin-middleware.spec.ts` | 3.5 |
| A-PERM-01, A-PERM-02 | P1 | UNIT (A-PERM-01: parse do SQL como texto) | `lib/auth/permissions.test.ts` | 3.4 |
| A-PERM-03 | P2 | UNIT (`react-dom/server`) | `components/can.test.ts` | 3.4 |
| A-PERM-04 … A-PERM-06 | P1/P2 | UNIT (+ C-NAV-01/02 E2E sem alteração) | `lib/auth/nav-registry.test.ts` | 3.4 |
| A-BOOT-01 | P1 | E2E | `e2e/tests/admin-bootstrap.spec.ts` | 3.6 |
| A-BOOT-02 | P2 | E2E (log de requisições do mock) | `e2e/tests/admin-bootstrap.spec.ts` | 3.4 |
| A-TEN-01 | P1 | MANUAL | checklist, fatia 3.4 | 3.4 |
| A-REG-01 | P1 | a suíte da Fase 1 (`pnpm test`, `pnpm test:e2e`) | — | todas |

Fase 1 substituída (§6 da spec): C-AUTH-05 → A-MW-03 (não havia teste); C-NAV-04 → A-BOOT-01 (o
`test.fail()` foi removido de `e2e/tests/nav.spec.ts`); C-DB-04 → A-DB-09 e C-DB-05 → A-DB-06
(marcados no checklist da Fase 1).

---

## 3. Migrations da Fase 3

<a id="migrations-da-fase-3"></a>

Em `scripts/` (D-3), cada uma com o par `scripts/rollback/<nome>.down.sql`, que o A-DB-17 testa
(aplica → reverte → reaplica num banco local descartável). **Nenhuma foi aplicada em banco nenhum
por esta automação.** Ordem e verificações: [`docs/fase-3/runbook.md`](../fase-3/runbook.md).

| Fatia | Migration | Conteúdo | Rollback |
|---|---|---|---|
| — | `011_reconcile_schema.sql` | Idempotente: o que produção tem e os scripts não criavam (colunas de `sales`, `qtdmonths`, `sale_items` sem gatilho, `sale_salespersons`). Em produção não muda nada | nada a reverter |
| 3.1 | `012_fix_missing_rls.sql` | RLS em `sale_items` e `sale_salespersons` (herdado de `sales`, ainda com dono = `auth.uid()`); `security_invoker` nas 3 views; `revoke` de tudo do `anon`; o `authenticated` perde `TRUNCATE`/`TRIGGER`/`REFERENCES` e o acesso às 2 funções e à view que o app não usa | Só para o A-DB-17; **não reverter em produção** (fecha brecha) |
| 3.1 | `019_tenant_fk_restrict.sql` | As 6 FKs `user_id → auth.users` passam de `CASCADE` para `RESTRICT`: apagar o usuário dono é recusado | volta a `CASCADE` |
| 3.1 | `views/sales_with_details.sql` | Recriada `with (security_invoker = on)` | coberto pelo `.down` da 012 |
| 3.1 | `views/sales_with_salespersons.sql`, `views/salesperson_summary.sql` | Definições de produção (baseline de 28/09/2026) + `security_invoker`. A 012 só faz o `alter view`; os arquivos documentam a definição | coberto pelo `.down` da 012 |
| 3.2 | `013_create_profiles.sql` | `profiles`, `profile_salespersons` (`unique (salesperson_id)`), `role_permissions` + seed do admin; gatilho `on_auth_user_created` (só cria perfil quando `app_metadata` traz papel e inquilino); RLS de `profiles` só com `auth.uid()` e claims (§7.2); nenhuma escrita pelo cliente | `drop` do gatilho, da função e das 3 tabelas |
| 3.2 | `014_auth_helpers.sql` | `current_tenant_id()`, `current_app_role()`, `is_admin()` (claim → queda para `profiles` ativo); `custom_access_token_hook`; política de `profile_salespersons`. `my_salesperson_ids()` fica para a Fase 6 (D-6) | **Antes:** desligar o hook no painel; depois `drop` das funções e políticas |
| 3.3 | `015_rewrite_policies.sql` | Remove todas as políticas das 10 tabelas; cria `<tabela>_tenant_admin_all` (comentada) nas 8 com `user_id` e nas 2 filhas; `default current_tenant_id()` em `user_id` | Volta ao modelo `auth.uid() = user_id` + remove o default. **Comparar com o `pg_policies` da baseline antes de usar em produção** |
| 3.3 | `017_indexes.sql` | `profiles(tenant_id, role)`, `profile_salespersons(profile_id)`, `sale_salespersons(salesperson_id, sale_id)` | `drop index if exists` |
| 3.3 | `018_backfill_admin.sql` | Todo dono de empresas vira admin do próprio inquilino (`tenant_id = id`) | Remove só os perfis do backfill |

`016_vendor_views.sql` é da Fase 6. A `019` usa o próximo número livre, mas vai na fatia 3.1; as políticas do vendedor (Fase 6) passam a ser a `020`.

---

## 4. Critérios de saída da Fase 2 (§8)

- [ ] Catálogo aprovado por um revisor além do autor — **pendente**
- [x] Decisões 3.1 a 3.7 registradas e fechadas (§1)
- [x] Q7 — sem resposta; A-DB-11/A-TEN-01 mantidos como detectores de N3
- [x] Casos presentes nos relatórios do Vitest e do Playwright (hoje já como testes de verdade)
- [ ] Checklist MANUAL revisado junto com o catálogo — **redigido, revisão pendente**

---

## 5. Fase 3 implementada

| Fatia | Situação |
|---|---|
| 3.1–3.3 (banco) | Migrations e rollbacks escritos. **Não aplicados**: dependem do checklist MANUAL e do runbook, executados por um humano |
| 3.4 (front) | `SessionProvider`, `usePermissions`, `<Can>`, `nav-registry`; abas de `dashboard-layout.tsx` e `company-dashboard.tsx` vêm do registro; nenhum uso do id do usuário logado em filtros ou inserções |
| 3.5 (rotas) | Middleware decide pelas claims (`getClaims()`), renova a sessão uma vez; `app/403`; destino pós-login por papel; auto-cadastro fora das rotas públicas |
| 3.6 (bootstrap) | Sem auto-criação de empresas; estado vazio |

Critérios de saída da Fase 3 (§5 da spec) ainda abertos, todos manuais: A-DB-xx executados por
fatia; `pg_policies` conferido; runbook e rollbacks revisados por uma segunda pessoa;
`explain analyze` antes/depois; desligar o auto-cadastro no painel.

O mock dos E2E passou a emular o hook de token, a renovação de sessão e o RLS por inquilino
(`e2e/mock-server/rls.mjs`) — sem isso, retirar o filtro por `user_id` faria a tela mostrar a
empresa do outro inquilino. Chamadas sem header `Authorization` (o próprio harness de teste) passam
sem RLS, como o `service_role`, e é por isso que os testes da Fase 1 continuam sem alteração.
