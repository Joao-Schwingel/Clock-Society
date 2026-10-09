# Fase 5 — Entregáveis (casos de teste do papel vendedor)

Spec: [`specs/release-2/fase-5-casos-de-teste-vendedor.md`](../../specs/release-2/fase-5-casos-de-teste-vendedor.md).
Esta fase **não implementa nada**: registra os casos como `it.todo`/`test.fixme`, monta os fixtures e
redige o checklist MANUAL. Código de produção e banco não mudam.

**Status:** rascunho. As decisões de negócio foram respondidas na **issue #13** (08/10/2026); as
técnicas estão como proposta. Falta a aprovação de um revisor além do autor (§7 da spec).

| Entregável (§7 da spec) | Onde |
|---|---|
| Q2, Q4, Q6 e Q10 respondidas | ✅ issue #13 (08/10/2026) — resumo na §2 da spec |
| Decisões 3.1 a 3.10 | §1 deste documento (3.1 e 3.9 pendentes na #13) |
| Fixture da §4 | `e2e/fixtures/users.json`, `profiles.json`, `profile_salespersons.json`; o seed manual lista os vínculos |
| `it.todo` dos casos UNIT/E2E | §2 deste documento |
| Checklist MANUAL (V-DB-xx) | [`docs/manual-checklists/fase-5-checklist-banco-vendedor.md`](../manual-checklists/fase-5-checklist-banco-vendedor.md) |

**Pré-requisitos da Fase 6 em produção** (não bloqueiam esta fase):

- **Fase 4** (teste manual do admin) ainda não aconteceu: o app da Fase 3 não foi publicado.
- **Issue #9** (RLS de `sale_items`/`sale_salespersons`, `security_invoker` nas views, grants do
  `anon`): sem ela, o vendedor leria todas as vendas. Vira a migration `019_fix_missing_rls.sql`.

---

## 1. Decisões (§3 da spec)

| # | Decisão | Situação | Proposta |
|---|---|---|---|
| 3.1 | Colunas de `vendor_sales` e o que a coluna "Vendedor / Comissão" mostra | ✅ #13 | As da §4.4 + `salespersons`: nomes de todos os vendedores da venda, % só do próprio. Na comissão por vendedor, o vendedor vê vendas, custo e lucro dos colegas, não a comissão |
| 3.2 | `commission_summary(p_company_id, p_year, p_months)` | ✅ `016` (regras: padrões da **#13**) | 7 colunas da §4.4 **+ `is_active`**; meses 1..12 (o front converte de 0..11); `p_months` nulo = sem filtro de data; sem arredondamento; inativo com vendas incluído; `security definer` com guarda interna |
| 3.3 | Cartão "comissão do período" do vendedor | Proposta | Linha do próprio vendedor na `commission_summary()`, nunca cálculo no navegador (N9) |
| 3.4 | `sales_with_details` para o vendedor | Proposta | 0 linhas (condição `is_admin()` na view); o vendedor usa só `vendor_sales` |
| 3.5 | Contrato de `/api/users` | Proposta | zod; 401 sem sessão, 403 não admin, 409 e-mail duplicado, 422 validação; mensagens em PT-BR |
| 3.6 | `must_change_password` | Proposta | Vai para as claims pelo hook; a troca é uma rota de servidor que limpa a flag e renova a sessão |
| 3.7 | Desativação | Proposta | `is_active = false` → hook sem claims e funções auxiliares negando; login bloqueado no Auth (`ban_duration`) |
| 3.8 | Área do vendedor | Proposta | Rota própria `/vendedor`: abas Vendas, Comissões e Estoque; seletor de empresa |
| 3.9 | Detalhe da venda para o vendedor (N8) | ✅ #13 | A única ação do vendedor é o "olho": detalhe **com custos e lucro, só leitura** (o vendedor lê `sale_costs` das vendas em que consta) |
| 3.10 | Modo leitura | Proposta | `SalesTable` com colunas e ações configuráveis; `InventoryTable` com `readOnly` |

### Fixture: diferenças em relação à §4 da spec

A spec cita "Bruno em A e B", "Carla em C" e "Diego em B", que não existem no fixture da Fase 1.
Criar esses registros mudaria os números do oráculo (cartões por vendedor do Dashboard, lista de
Configurações). Os logins foram mapeados para os registros existentes:

| Login | Vínculos | Serve para |
|---|---|---|
| `vend-a@t1` | Ana (A) | Caso base; venda compartilhada com Bruno |
| `vend-b@t1` *(novo)* | Bruno (A) | O outro lado da venda compartilhada (V-DB-01/17) |
| `vend-ab@t1` | Carla (A) + Carla (B) | Multiempresa e seletor |
| `vend-zero@t1` | Diego (A), sem vendas | Estado vazio |
| `vend-inativo@t1` | Elis (A), **perfil desativado** | Acesso bloqueado; a Elis também é o caso N12 |
| `vend-troca@t1` | sem vínculo, `must_change_password` | Troca obrigatória |
| — | "Site" das 3 empresas, sem login | V-REG-03 |

Os vínculos estão em `e2e/fixtures/profile_salespersons.json`. Num banco real os ids são outros, e
por isso o seed manual só **lista** os vínculos esperados; quem executa o checklist liga à mão.

---

## 2. Rastreabilidade dos casos

| ID | Camada | Arquivo | Fatia (Fase 6) |
|---|---|---|---|
| V-DB-01 … V-DB-17 | MANUAL | `docs/manual-checklists/fase-5-checklist-banco-vendedor.md` | 6.2, 6.3 |
| V-API-01, 03, 04, 05 | UNIT (repositório em memória) | `lib/users/service.test.ts` | 6.5 ✅ |
| V-API-02 | UNIT + E2E | `app/api/users/route.test.ts`, `e2e/tests/users-admin.spec.ts`, `lib/auth/route-guard.test.ts` | 6.5 ✅ |
| V-API-06 | UNIT + CI (`scripts/check-service-role-leak.mjs` depois do build) | `lib/supabase/admin.test.ts` | 6.5 ✅ |
| V-MW-01 … V-MW-04 | UNIT + E2E | `lib/auth/route-guard.test.ts`, `e2e/tests/vendor-middleware.spec.ts` | 6.6 (V-MW-02 ✅), 6.7 (V-MW-04 ✅), 6.8 |
| V-UI-01, 02 | UNIT + E2E | `lib/auth/nav-registry.test.ts`, `lib/auth/permissions.test.ts`, `e2e/tests/vendor-ui.spec.ts` | 6.8 |
| V-UI-03 … V-UI-07 | E2E | `e2e/tests/vendor-ui.spec.ts` | 6.4, 6.8 |
| V-UI-08 | UNIT + E2E | `lib/auth/password-rules.test.ts`, `app/api/me/password/route.test.ts`, `e2e/tests/users-admin.spec.ts` | 6.6 ✅ |
| V-UI-09 | UNIT + E2E | `lib/auth/permissions.test.ts`, `lib/auth/nav-registry.test.ts`, `e2e/tests/users-admin.spec.ts` | 6.7 ✅ |
| V-REG-01 … V-REG-03 | E2E | `e2e/tests/vendor-regression.spec.ts` (V-REG-01 ✅ + C-DASH-03/04; V-REG-02 ✅, fotos em `e2e/fixtures/golden-csv/`) | 6.1, 6.4 |

Casos que dependem da #13: V-DB-08 (3.4), V-DB-09 (3.1), V-DB-12, V-UI-04 (exportação e coluna de
comissão), V-UI-06 e V-REG-01. Estão como `it.todo`/`test.fixme` com a marca "#13".

### Testes da Fase 3 que mudam na Fase 6

Mudam de propósito, porque o vendedor passa a ser um papel funcional:

| Caso da Fase 3 | Hoje | Depois da Fase 6 |
|---|---|---|
| `permissions.test.ts`: "vendedor ainda não tem permissões na Fase 3 (D-6)" | sem permissões | permissões do vendedor (V-UI-01) |
| `route-guard.test.ts`: `homeForRole("vendedor")` → `/403` (A-MW-05) e vendedor em `/dashboard` → `/403` (A-MW-04) | `/403` | área do vendedor (V-MW-01); `/dashboard` continua `/403` (V-MW-03) |
| `admin-middleware.spec.ts`: `vendedor-sem-vinculo@t1` cai em `/403` (A-MW-04) | `/403` | estado vazio na área do vendedor (V-UI-03) |
| `dashboard.spec.ts` (Fase 1): C-DASH-04 — a inativa (Elis) não tem cartão | sem cartão | o **admin** vê o cartão com a etiqueta INATIVO (#13, Q10; 6.4, feito). Números iguais |
| `permissions.test.ts`: A-PERM-02 (catálogo com 11 permissões) | 11 | 12 — entra `users.manage` (6.7, feito) |
| `nav-registry.test.ts`: A-PERM-04 (abas do admin) | empresas + Contratos | + **Usuários** depois de Contratos (planejamento, Anexo C; 6.7, feito) |

O A-DB-08 (vendedor sem vínculo lê 0 linhas no banco) continua valendo.

---

## 3. Migrations da Fase 6

| Fatia | Migration | Conteúdo |
|---|---|---|
| 6.2 | `019_fix_missing_rls.sql` ✅ escrita | **Issue #9**: liga o RLS de `sale_items`/`sale_salespersons` (as políticas da 015 passam a valer), `security_invoker` nas 3 views, revoga o `anon`, tira do `authenticated` TRUNCATE/TRIGGER/REFERENCES e os objetos mortos |
| 6.2 / 6.7 | `020_vendor_policies.sql` ✅ escrita | Catálogo (`users.manage` + vendedor), admin sempre ativo, funções auxiliares negando perfil desativado, `is_vendor()`/`my_salesperson_ids()`/`my_company_ids()`/`vendor_can_see_sale()` (quebram a recursão de RLS), hook com `must_change_password`, políticas de leitura do vendedor (`sale_salespersons` só as próprias linhas), views antigas só para admin |
| 6.3 | `016_vendor_views.sql` ✅ escrita | `vendor_sales` (`security_invoker`, sem custo, com `my_commission_percent` do próprio vendedor) e `commission_summary()` (`security definer`, guarda interna, 8 colunas). **Não aplicar em produção antes da #13** |

Cada uma com o par em `scripts/rollback/`, testado no A-DB-17 da Fase 6.

---

## 4. Critérios de saída da Fase 5 (§7)

- [ ] Q2, Q4, Q6 e Q10 respondidas e registradas — **#13**
- [ ] Decisões 3.1 a 3.10 fechadas — 3.1 e 3.9 na **#13**; o resto como proposta
- [x] Fixture da §4 (mapeado aos registros existentes, §1)
- [x] `it.todo`/`test.fixme` de todos os V-xx automatizáveis
- [x] Checklist MANUAL redigido com os V-DB-xx
- [ ] Catálogo aprovado por pelo menos um revisor além do autor
