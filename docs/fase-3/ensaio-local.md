# Ensaio local da Fase 3 (passo 3)

> **Executado à mão, por um humano, num Supabase LOCAL descartável (Docker).** Nunca aponte
> nenhum comando daqui para produção. Nenhum agente de IA executa estes passos.
> O backup em `backups/` tem dados reais e hashes de senha: fica só na sua máquina (está no
> `.gitignore`) e o banco local é apagado no fim (passo 9).

Resultado esperado: o checklist [`fase-2-checklist-banco-admin.md`](../manual-checklists/fase-2-checklist-banco-admin.md)
preenchido e o [runbook](runbook.md) ensaiado de ponta a ponta com os dados reais.

---

## 1. Supabase CLI

Arch: `yay -S supabase-bin` (ou baixe o binário em github.com/supabase/cli/releases).
Confira com `supabase --version`.

## 2. Subir o Supabase local

Na raiz do repositório:

```bash
supabase init          # cria supabase/config.toml (não precisa commitar)
supabase start         # sobe Postgres, Auth, PostgREST etc. no Docker
supabase status -o env # anote API_URL, ANON_KEY, SERVICE_ROLE_KEY e DB_URL
```

Neste roteiro:

```bash
export LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Confira que `LOCAL_DB` aponta para `127.0.0.1` antes de **todo** `psql` abaixo.

## 3. Restaurar o backup

```bash
psql "$LOCAL_DB" -f backups/schema.sql 2>&1 | tee /tmp/restore-schema.log
psql "$LOCAL_DB" -f backups/data.sql   2>&1 | tee /tmp/restore-data.log
grep -n ERROR /tmp/restore-schema.log /tmp/restore-data.log
```

Alguns `ERROR` são esperados e podem ser ignorados: extensões ou schemas que já existem, e tabelas
de `auth`/`storage` que a versão local não tem, como `scim_*` e `custom_oauth_providers`. **Não
podem falhar** os `COPY` de `public.*`, `auth.users` e `auth.identities`. Se falharem, atualize o
CLI e repita a partir do passo 2, depois de `supabase stop --no-backup`.

Descubra o seu id (dono das empresas):

```sql
select distinct user_id from public.companies;   -- guarde como ADMIN_ID
```

## 4. Foto "antes" (oráculo do A-DB-04)

Rode com `psql "$LOCAL_DB"`, simulando o seu usuário (troque `<ADMIN_ID>`), e guarde o resultado:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<ADMIN_ID>","role":"authenticated"}';
select 'companies' t, count(*) from companies union all
select 'salespersons', count(*) from salespersons union all
select 'sales', count(*) from sales union all
select 'sale_items', count(*) from sale_items union all
select 'sale_salespersons', count(*) from sale_salespersons union all
select 'sale_costs', count(*) from sale_costs union all
select 'costs', count(*) from costs union all
select 'fixed_costs', count(*) from fixed_costs union all
select 'contracts', count(*) from contracts union all
select 'inventory', count(*) from inventory union all
select 'sales_with_details', count(*) from sales_with_details union all
select 'sales_with_salespersons', count(*) from sales_with_salespersons;
rollback;
```

Repita a mesma consulta **sem** as duas linhas `set local` (como `postgres`, que ignora o RLS). Se
os números forem iguais aos da consulta simulada, todos os dados são seus. Se forem maiores, há dados
de outros usuários (o auto-cadastro esteve aberto), e a 018 vai criar mais de um admin.

Rode também `scripts/retrato/retrato.sql` e guarde o resultado fora do repositório.

## 5. Fatia 3.1 — `011`, `012` e `019`

```bash
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/011_reconcile_schema.sql   # não deve mudar nada
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/012_fix_missing_rls.sql
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/019_tenant_fk_restrict.sql
```

- **A-DB-18** e **A-DB-19:** siga o checklist. O A-DB-18 tenta apagar o seu usuário dentro de
  `begin … rollback`, e o banco tem que recusar.

- **A-DB-04:** repita a consulta simulada do passo 4. Tem que dar exatamente os mesmos números.
- **A-DB-09:** sem login, só com a chave anon local:
  ```bash
  curl "http://127.0.0.1:54321/rest/v1/sales_with_details?select=id&limit=1" -H "apikey: $ANON_KEY"
  ```
  Esperado: erro `42501` (permission denied). Antes da 012, isso devolvia vendas.

## 6. Fatia 3.2 — `013`, `014` e o hook

```bash
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/013_create_profiles.sql
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/014_auth_helpers.sql
```

Ligue o hook em `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Reinicie **sem apagar os dados**: `supabase stop` e depois `supabase start`. **Nunca use
`--no-backup` aqui**, porque ele apaga o banco.

Crie os usuários de teste. O `admin2@t1` e o `vendedor-sem-vinculo@t1` entram no **seu** inquilino:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
T1_TENANT_ID=<ADMIN_ID> node scripts/manual/fase-2/seed-usuarios.mjs
```

Checklist da fatia 3.2: A-DB-02 (use `login-as.mjs`), A-DB-03, A-DB-12, A-DB-13 e A-DB-14.

## 7. Fatia 3.3 — `015`, `017`, `018`

```bash
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/015_rewrite_policies.sql
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/017_indexes.sql
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/018_backfill_admin.sql   # anote o NOTICE
```

- **A-DB-01:** o seu perfil existe, com `role = admin` e `tenant_id = ADMIN_ID`.
- **A-DB-04:** repita a consulta simulada do passo 4. Precisa bater com os números de antes. Esta é
  a verificação mais importante do ensaio.
- **A-DB-06:** crie uma empresa para o inquilino T2 como `postgres`:
  `insert into companies (name, code, user_id) values ('Empresa T2', 'T2X', '<id do outro@t2>');`
  Depois confira que o seu usuário não a vê, e que o `outro@t2` não vê nada seu.
- A-DB-05, 07, 08, 10, 11, 15 e 16: siga o checklist.

## 8. App contra o banco local

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> pnpm dev
```

Antes de clicar em qualquer coisa que grave, abra o DevTools > Network e confirme que as chamadas
vão para `127.0.0.1:54321`. Variável de ambiente tem precedência sobre o `.env.local`, mas confira
mesmo assim.

- Entre com o **seu e-mail e senha reais**, que vieram no backup. O app deve cair em `/dashboard`
  com os mesmos números do retrato.
- **A-TEN-01:** noutro navegador, entre como `admin2@t1.test` / `senha123`. Os números têm que ser
  os mesmos. Crie uma venda como `admin2` e veja se ela aparece para você.
- `semperfil@t1.test` e `vendedor-sem-vinculo@t1.test` precisam cair em `/403`.
- **`explain analyze`:** com o mesmo `set local` do passo 4, rode as consultas de vendas paginadas
  (`sales_with_details … order by order_number desc limit 10`), das estatísticas e do dashboard.
  Compare com o resultado antes da 015.

## 9. A-DB-17 e limpeza

1. Reverta, na ordem: `018`, `017`, `015`, `014` (desligue antes o hook no `config.toml` e reinicie),
   `013`, `019`, `012` e `011`, cada um com o seu `scripts/rollback/*.down.sql`. Depois rode o passo 4: os números
   precisam voltar aos de antes.
2. Reaplique tudo (passos 5 a 7) e confira o A-DB-04 de novo. O rollback da 013 apaga a tabela
   `profiles`; por isso rode o seed do passo 6 de novo depois de reaplicar a 014.
3. Registre os resultados no checklist e anexe à PR #8.
4. **Apague o banco local, que tem dados reais:** `supabase stop --no-backup`.
