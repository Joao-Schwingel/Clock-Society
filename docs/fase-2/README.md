# Fase 2 — Entregáveis (casos de teste do papel admin)

Spec: [`specs/release-2/fase-2-casos-de-teste-admin.md`](../../specs/release-2/fase-2-casos-de-teste-admin.md).
Esta fase **não implementa nada**: fecha interfaces, registra os casos como `it.todo`/`test.fixme` e
redige o checklist MANUAL. O código de produção não muda.

**Status:** proposta, aguardando revisão (§8 da spec). Todas as decisões abaixo estão como
*proposta* até um revisor além do autor aprovar.

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

| # | Decisão | Proposta | Observação |
|---|---|---|---|
| 3.1 | Catálogo de permissões | As 11 permissões da tabela §3.1 da spec, com o admin tendo todas. `users.manage` só na Fase 6. Na Fase 3, `role_permissions` recebe **só as linhas do admin** (D-6) | O catálogo do front (`lib/auth/permissions.ts`) e o seed SQL da 013 precisam coincidir: A-PERM-01 compara os dois como texto |
| 3.2 | Sessão no front | `{ userId, tenantId, role, salespersonIds, permissions }`, montada das claims + `role_permissions`. `userId` fica só para exibição; nenhum filtro ou insert usa ele (N3) | Na Fase 3, `salespersonIds` é sempre `[]` para o admin |
| 3.3 | Claims e leitura no middleware | Claims em `app_metadata.app_role` e `app_metadata.tenant_id`. O middleware usa **`supabase.auth.getClaims()`** | **Verificado:** `@supabase/supabase-js` 2.85.0 (versão fixada) expõe `auth.getClaims()`. Com JWT assimétrico, valida a assinatura via JWKS; com HS256, cai em `getUser(token)` para validar e devolve o payload decodificado — por isso o mock server dos E2E, que já responde `/auth/v1/user`, serve para A-MW-02/06 sem mudança de protocolo, só emitindo tokens com as claims. Não é preciso decodificar o token à mão |
| 3.4 | Tabela de decisão do middleware | Como na spec. Extrair como **função pura** (sessão/claims/rota → `segue` \| `login` \| `renovar` \| `403`), testada em `lib/supabase/middleware.test.ts`; o middleware só aplica o resultado | "Renova uma vez": `refreshSession()` e nova leitura das claims; se continuar sem `app_role` → `/403` (A-MW-06) |
| 3.5 | Bloqueio por aba (N11) | O `nav-registry` resolve `?tab=`/`?company=` para a aba **ou** para "acesso negado"; o componente de acesso negado é renderizado no lugar da aba | A proteção real continua no RLS |
| 3.6 | `user_id` nas inserções | **Proposta da spec:** `default public.current_tenant_id()` nas 10 tabelas + `with check (user_id = current_tenant_id() and is_admin())`; o front para de mandar `user_id` | Recomendo a proposta: resolve N3 no banco, e o front não pode errar o inquilino. Impacto nos E2E: o mock server precisa preencher o default nos inserts sem `user_id` (Fase 3) |
| 3.7 | Estado vazio sem empresas | "Nenhuma empresa disponível." em PT-BR; nada é criado | A-BOOT-01 substitui C-NAV-04, que hoje documenta a quebra com `test.fail()` |

**Q7** (mais de um admin?) — sem resposta; vale o padrão do README: A-DB-11 e A-TEN-01 ficam como
detectores de N3 de qualquer forma.

### Achados desta fase

1. **`current_role` é palavra reservada do SQL.** O planejamento (§4.2) cria `public.current_role()`.
   Sem o schema, `current_role` resolve para a função embutida do Postgres, que devolve o papel do
   banco (`authenticated`), e não o papel do app — e `current_role()` com parênteses nem é sintaxe
   válida. Proposta: renomear para `public.current_app_role()`. Se o nome ficar, toda chamada precisa
   ser qualificada. O A-DB-03 e o A-DB-17 pegam o problema; o checklist já traz o aviso.
2. **Inserções que mandam `user_id` hoje:** `contracts-form`, `inventory-form`, `sales-form`,
   `sale-details-modal`, `fixed-cost-form`, `sale-cost-form`, `settings-modal` (as 7 do N3), mais
   `costs-form` (componente sem uso, achado 11) e o auto-create de `app/dashboard/page.tsx` (sai com
   A-BOOT-01). **Filtros por `user_id`:** `contracts-view`, `fixed-costs-view`, `dashboard-view`,
   `sales-form` (checagem de nº de pedido), `settings-modal` e `app/dashboard/page.tsx`.
3. **C-AUTH-05 não tem teste implementado** na Fase 1. A substituição por A-MW-03 é só no catálogo;
   não há teste da Fase 1 a remover.

---

## 2. Rastreabilidade dos casos

Casos **UNIT** → `it.todo` do Vitest. Casos **E2E** → `test.fixme` com corpo vazio no Playwright,
que não tem `it.todo`; o caso aparece como *skipped* no relatório do Playwright e nunca roda.

> **Desvio da §8 da spec:** o critério diz "listados no relatório do Vitest" também para os E2E. Os
> E2E da Fase 1 moram no Playwright, e é lá que os A-xx E2E vão virar teste na Fase 3; registrá-los
> no Vitest criaria uma segunda lista para manter em sincronia. Aparecem no relatório do Playwright
> (`pnpm test:e2e`). Se o revisor preferir o texto literal da spec, dá para espelhar os títulos num
> arquivo do Vitest.

| ID | Pri. | Camada | Arquivo | Fatia (Fase 3) |
|---|---|---|---|---|
| A-DB-01 … A-DB-17 | P1/P2 | MANUAL | `docs/manual-checklists/fase-2-checklist-banco-admin.md` | 3.1–3.3 |
| A-MW-01 | P1 | UNIT + E2E | `lib/supabase/middleware.test.ts`, `e2e/tests/admin-middleware.spec.ts` | 3.5 |
| A-MW-02 | P1 | UNIT + E2E (JWT fabricado) | idem | 3.5 |
| A-MW-03 | P1 | UNIT + E2E | idem | 3.5 |
| A-MW-04 | P1 | UNIT + E2E | idem | 3.5 |
| A-MW-05 | P2 | UNIT + E2E | idem | 3.5 |
| A-MW-06 | P1 | UNIT + E2E (JWT sem claims) | idem | 3.5 |
| A-PERM-01 | P1 | UNIT (parse do SQL como texto) | `lib/auth/permissions.test.ts` | 3.4 |
| A-PERM-02 | P1 | UNIT | `lib/auth/permissions.test.ts` | 3.4 |
| A-PERM-03 | P2 | UNIT | `components/can.test.ts` | 3.4 |
| A-PERM-04 | P1 | UNIT (+ C-NAV-01/02 E2E sem alteração) | `lib/auth/nav-registry.test.ts` | 3.4 |
| A-PERM-05 | P1 | UNIT (papel fictício) | `lib/auth/nav-registry.test.ts` | 3.4 |
| A-PERM-06 | P2 | UNIT | `lib/auth/nav-registry.test.ts` | 3.4 |
| A-BOOT-01 | P1 | E2E | `e2e/tests/admin-bootstrap.spec.ts` | 3.6 |
| A-BOOT-02 | P2 | E2E (rede mockada) | `e2e/tests/admin-bootstrap.spec.ts` | 3.4 |
| A-TEN-01 | P1 | MANUAL | checklist, fatia 3.4 | 3.4 |
| A-REG-01 | P1 | — | a própria suíte da Fase 1 (`pnpm test`, `pnpm test:e2e`) | todas |

Fase 1 substituída (§6 da spec): C-AUTH-05 → A-MW-03 (sem teste na Fase 1), C-NAV-04 → A-BOOT-01
(marcado em `e2e/tests/nav.spec.ts`), C-DB-04 → A-DB-09 e C-DB-05 → A-DB-06 (marcados no checklist
da Fase 1).

---

## 3. Migrations da Fase 3

Seguem a numeração de `scripts/` (regra do `CLAUDE.md`). Cada uma ganha um par
`scripts/rollback/<nome>.down.sql`, testado no A-DB-17 (aplica → reverte → reaplica num banco local
descartável). Ordem de reversão: inversa da aplicação.

<a id="migrations-da-fase-3"></a>

| Fatia | Migration | Conteúdo | Rollback (`.down.sql`) |
|---|---|---|---|
| 3.1 | `012_fix_missing_rls.sql` | RLS em `sale_items` e `sale_salespersons` (derivado de `sales`); `revoke` do `anon` em tabelas, views e funções | Planejamento §9: **não reverter em produção** (fecha brecha). O `.down.sql` existe só para o A-DB-17: `drop policy` das novas, `disable row level security` nas duas tabelas, `grant` do `anon` de volta ao inventário da baseline |
| 3.1 | `views/sales_with_details.sql` | Recriada com `security_invoker = on` | `alter view public.sales_with_details set (security_invoker = off)` |
| 3.1 | `views/sales_with_salespersons.sql` | Passa a ser versionada (hoje só existe no banco, Fase 1) + `security_invoker = on` | `alter view public.sales_with_salespersons set (security_invoker = off)` |
| 3.2 | `013_create_profiles.sql` | `profiles`, `profile_salespersons` (`unique (salesperson_id)`), `role_permissions` com as linhas do admin; gatilho `on_auth_user_created`; RLS de `profiles` sem funções auxiliares (§7.2) | `drop trigger on_auth_user_created on auth.users`; `drop function` do gatilho; `drop table` de `profile_salespersons`, `role_permissions`, `profiles` (nessa ordem) |
| 3.2 | `014_auth_helpers.sql` | `current_tenant_id()`, `current_role()` (ver achado 1), `is_admin()`, hook de token; `grant execute` só para `authenticated` (e `supabase_auth_admin` no hook). `my_salesperson_ids()` fica para a Fase 6 (D-6) | **Antes:** desabilitar o hook no painel (Auth > Hooks). Depois `drop function` das quatro, com `revoke` antes |
| 3.3 | `015_rewrite_policies.sql` | Políticas "admin do inquilino" nas 10 tabelas, com `comment on policy`; `alter column user_id set default public.current_tenant_id()` (decisão 3.6) | `drop policy` das novas; recriar as políticas a partir da baseline `pg_policies` salva na Fase 1; `alter column user_id drop default` |
| 3.3 | `017_indexes.sql` | `profiles(tenant_id, role)`, `profile_salespersons(profile_id)`, `sale_salespersons(salesperson_id, sale_id)` | `drop index if exists` dos três |
| 3.3 | `018_backfill_admin.sql` | Perfil do admin atual: `role = 'admin'`, `tenant_id = id`, `is_active = true` | Remover só a linha de perfil criada pelo backfill (por id), não a tabela inteira. O planejamento §9 diz "apagar tudo de `profiles`", mas depois do seed há outros perfis |

`016_vendor_views.sql` fica para a Fase 6. `011_reconcile_schema.sql` é da baseline da Fase 1.

**Divergência a resolver na revisão:** o README (D-3) recomenda `supabase/migrations/` como fonte
única, e o `CLAUDE.md` da Fase 1 diz "novo arquivo numerado em `scripts/`". Os nomes acima seguem
o `CLAUDE.md`, que é o que está em vigor no repositório.

**Ordem de implantação** (Fase 3 §4): backup → 012 + views → 013 → 014 → habilitar o hook → 015 +
017 + 018 na mesma janela → verificação (A-DB-01, A-DB-04) → deploy do app.

---

## 4. Critérios de saída (§8) — situação

- [ ] Catálogo aprovado por um revisor além do autor — **pendente**
- [x] Decisões 3.1 a 3.7 registradas (como proposta; §1)
- [x] Q7 — sem resposta; A-DB-11/A-TEN-01 mantidos como detectores de N3
- [x] `it.todo` presentes: Vitest (UNIT) e `test.fixme` no Playwright (E2E) — ver desvio na §2
- [ ] Checklist MANUAL revisado junto com o catálogo — **redigido, revisão pendente**
