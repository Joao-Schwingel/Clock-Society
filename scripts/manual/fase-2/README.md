# Helpers MANUAIS da Fase 2

> **Nunca automatizados. Nunca executados por um agente de IA. Nunca contra produção.**
> Contrapartida da restrição da Fase 1 §1: a suíte automatizada não toca banco; quem precisa de
> banco é o checklist MANUAL ([`docs/manual-checklists/fase-2-checklist-banco-admin.md`](../../../docs/manual-checklists/fase-2-checklist-banco-admin.md)).

| Arquivo | Para quê |
|---|---|
| `seed-usuarios.mjs` | Cria os logins da §4 da spec (`admin@t1`, `admin2@t1`, `outro@t2`, `semperfil@t1`, `vendedor-sem-vinculo@t1`) e os perfis de `e2e/fixtures/profiles.json`. Precisa das migrations 013/014 aplicadas e da chave `service_role` do ambiente local/homologação |
| `login-as.mjs` | `loginAs(email)` → cliente `supabase-js` autenticado; `readClaims(session)` → `app_role`/`tenant_id` do token. Via CLI, imprime as claims (A-DB-02) |
| `guard.mjs` | Trava comum: aborta em CI, sem terminal interativo, ou com `SUPABASE_URL` que não seja `localhost`/`127.0.0.1` nem igual a `HOMOLOG_SUPABASE_URL` |

Os usuários e senhas vêm de [`e2e/fixtures/users.json`](../../../e2e/fixtures/users.json) — os
mesmos que o mock server dos E2E usa. São senhas de teste; nunca as use num ambiente com dados reais.
