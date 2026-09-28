# Runbook de implantação — Fase 3 (papel admin)

> **Executado à mão, por um humano, com a janela combinada.** Nenhum passo aqui roda em CI ou por
> um agente de IA. Spec: [`fase-3-implementacao-admin.md`](../../specs/release-2/fase-3-implementacao-admin.md) §4;
> ensaio completo na Fase 4 (homologação) antes de produção.

## Pré-requisitos (antes da janela)

- [ ] Checklist MANUAL da Fase 2 ([`fase-2-checklist-banco-admin.md`](../manual-checklists/fase-2-checklist-banco-admin.md))
      executado **em homologação** para as fatias 3.1–3.4, com resultados anexados ao PR
- [ ] A-DB-17 OK: toda migration aplica → reverte → reaplica num banco local descartável
- [ ] Baseline da Fase 1 em mãos: `pg_policies` salvo (fonte do rollback da 015) e a definição de
      `sales_with_salespersons` (`pg_get_viewdef`), que ainda não está versionada
- [ ] Retrato dos números de produção **antes** (Fase 1 §6), guardado fora do repositório
- [ ] Deploy anterior identificado na Vercel, para *redeploy* imediato em caso de retorno
- [ ] `explain analyze` das 3 consultas pesadas do admin (vendas paginadas, estatísticas, dashboard),
      antes/depois, num banco local com volume parecido (Fase 3 §4)

## Fatia 3.1 — pode ir sozinha, antes do resto

1. Backup do banco.
2. Aplicar `scripts/012_fix_missing_rls.sql` (já inclui o `security_invoker` das duas views).
3. Verificar na hora: **A-DB-04** (contagens do admin iguais às de antes), **A-DB-06** (views e
   `sale_items`), **A-DB-09** (anon não lê nada). Divergência em A-DB-04 → reverter a 012 com o
   `.down.sql` e investigar (§7.4 do planejamento).

## Janela principal — fatias 3.2 a 3.6

| # | Passo | Verificação imediata |
|---|---|---|
| 1 | Backup do banco | — |
| 2 | `scripts/013_create_profiles.sql` | Tabelas criadas; `role_permissions` com 11 linhas do admin |
| 3 | `scripts/014_auth_helpers.sql` | Funções existem; `select current_role;` continua devolvendo o papel do banco |
| 4 | **Painel:** Authentication > Hooks > Customize Access Token → `public.custom_access_token_hook` | Novo login de teste traz `app_role`/`tenant_id` no token (A-DB-02) |
| 5 | `scripts/015_rewrite_policies.sql`, `scripts/017_indexes.sql` e `scripts/018_backfill_admin.sql`, **em sequência imediata** | A `018` imprime quantos admins foram criados; conferir A-DB-01 e A-DB-04 |
| 6 | Deploy do app (branch da Fase 3) na Vercel | Login do admin cai em `/dashboard`, com os mesmos números do retrato |
| 7 | **Painel:** Authentication > Sign In / Providers → desligar "Allow new users to sign up" | Tentativa de cadastro é recusada |
| 8 | Retrato dos números **depois** e diff com o de antes | Nenhuma diferença |

> Entre os passos 5 e 6, o app antigo ainda manda `user_id` nas inserções e filtra por ele. Isso
> continua funcionando: o `user_id` enviado é o id do admin, que é igual ao inquilino. Por isso a
> ordem banco → app é segura. Com o app novo e o banco antigo não funcionaria (sem o default de
> `user_id` da 015, as inserções falhariam); **nunca publique o app antes do passo 5**.

## Retorno

**Gatilho:** qualquer divergência nos números do admin, sem solução em 30 minutos (planejamento §9).

Ordem inversa, cada uma com o seu `scripts/rollback/*.down.sql`:

1. *Redeploy* do app anterior na Vercel.
2. `018` → `017` → `015` (confira com o `pg_policies` da baseline antes de aplicar).
3. Desabilitar o hook no painel **antes** de reverter a `014`.
4. `014` → `013`.
5. A `012` **não** é revertida em produção (fecha brechas).

## Registro

| Data | Ambiente | Executado por | Passos OK | Observações |
|---|---|---|---|---|
| | | | | |
