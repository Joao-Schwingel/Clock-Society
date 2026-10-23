# Clone local de produção — referência dos scripts

> **O passo a passo está em [`docs/ambientes.md`](../../docs/ambientes.md)**: clonar produção,
> publicar em homologação, apontar o preview da Vercel e a lista de problemas conhecidos.
> Este arquivo documenta os scripts em si.

> **Rodado à mão, por um humano. Nunca por um agente de IA, nunca em CI** (Fase 1 §1: nenhum
> teste e nenhum comando de agente conecta em banco real).
> Produção é usada **só para leitura**, nos dois caminhos abaixo.

Cópia descartável do banco de produção rodando na sua máquina (Supabase local, no Docker), para
testar migrations, RLS, o hook de token e o app sem encostar em produção. Substitui os passos 1 a 3
do [`docs/fase-3/ensaio-local.md`](../../docs/fase-3/ensaio-local.md) em máquinas sem `psql`/`pg_dump`
instalados — os binários usados são os de dentro do container, que já são da versão certa (PG 17,
igual ao `major_version` do `supabase/config.toml`).

## Qual dos dois caminhos

| | `pnpm db:clone` (pg_dump) | `pnpm db:clone:rest` (API) |
|---|---|---|
| Precisa da senha do Postgres | **sim** | não, só da `service_role_key` |
| Schema | cópia fiel de produção | montado pelas migrations; divergência é **relatada** |
| Funções, triggers, policies, grants | vêm de produção | vêm das migrations |
| Senhas dos logins | as reais (hashes no dump) | uma senha de teste para todos |
| ids e e-mails dos usuários | preservados | preservados |
| Dados | `public` inteiro | só as tabelas expostas na API REST |

Os dois preservam os ids, então os dados ficam consistentes nos dois casos. Se você tem a senha do
banco, prefira o `pnpm db:clone`.

## Pré-requisitos

- Docker Desktop rodando (só isso: a CLI do Supabase é devDependency do projeto).
- Para o `db:clone`: a connection string de produção, no painel → **Project Settings → Database →
  Connection string → URI**. Use a do **pooler na porta 5432** (modo session); a 6543 (transaction)
  não funciona com `pg_dump`.
- Para o `db:clone:rest`: nada além do `.env` que o app já usa (`NEXT_PUBLIC_SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY`).

## Receita — `pnpm db:clone` (com a senha do banco)

```bash
# 1. clonar (sobe o Supabase local se precisar, lê produção, restaura no local e mostra o retrato)
SUPABASE_DB_URL='postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres' \
  pnpm db:clone

# 2. apontar o app para o clone: .env.local (veja "Apontar o app para o clone" abaixo) e depois
pnpm dev

# 3. aplicar migrations no clone, na ordem, uma por uma
pnpm db:sql scripts/011_reconcile_schema.sql
pnpm db:sql scripts/013_create_profiles.sql
# ...

# 4. consultar
pnpm db:sql -c "select count(*) from sales"

# 5. APAGAR o clone ao terminar: ele tem dados reais e hashes de senha
pnpm db:local:apagar
```

Se `SUPABASE_DB_URL` já estiver em `../.env` (um nível acima da raiz do repo, mesma convenção do
[`scripts/backup.sh`](../backup.sh)), o passo 1 é só `pnpm db:clone`.

## Receita — `pnpm db:clone:rest` (sem a senha do banco)

```bash
pnpm db:clone:rest        # pergunta "sim" antes de qualquer coisa
```

Lê a URL e a `service_role_key` do `.env`, então não precisa passar nada. Ele:

1. sobe o Supabase local, se não estiver de pé, e **exige um `public` vazio**;
2. lê o catálogo de produção (OpenAPI do PostgREST), os dados de cada tabela (GET paginado, 1000
   por página) e os usuários do Auth (Admin API) — tudo gravado em `backups/rest-clone-<data>/`;
3. monta o schema local pelas migrations, na receita do cabeçalho da `011` (001–009, pular a 010,
   011 e as views);
4. gera e aplica o `load.sql`, que entra com `session_replication_role = replica`: **nenhum gatilho
   dispara** (o `create_site_salesperson_trigger` da 009 não duplica os vendedores "Site", e o
   `end_date` dos custos fixos fica igual ao de produção) e a ordem das tabelas não importa;
5. imprime produção vs. clone linha por linha e o **relatório de divergência de schema** entre a
   API de produção e o que as migrations criaram.

Senha dos logins no clone: `clone-local`, ou o que estiver em `CLONE_TEST_PASSWORD`. Os e-mails e
os ids são os de produção.

Se produção tiver uma coluna `not null` que as migrations locais não criam, a carga **aborta** na
transação e o erro do Postgres aponta a coluna — nada fica pela metade. Nesse caso, veja o
relatório de divergência, acerte a migration e recomece com `pnpm db:local:apagar && pnpm db:local`.

| Comando | O que faz |
|---|---|
| `pnpm db:clone` | Clona produção no local via `pg_dump` (precisa da senha do banco) |
| `pnpm db:clone:rest` | Clona via API REST + Admin API (só a `service_role_key`) |
| `pnpm db:local` | `supabase start` — sobe o stack local |
| `pnpm db:local:status` | URLs e chaves do stack local |
| `pnpm db:local:parar` | `supabase stop` — derruba os containers e **preserva** o banco |
| `pnpm db:local:apagar` | `supabase stop --no-backup` — derruba e **apaga** o banco local |
| `pnpm db:sql <arquivo\|-c SQL>` | Roda SQL no clone local |

| `pnpm db:test:vinculo` | Testes de banco do vínculo login ↔ vendedor (banco próprio, descartável) |

Tudo em Node, nada em shell: no PowerShell o `bash` do PATH é o do WSL
(`C:\Windows\System32\bash.exe`), que falha com `execvpe(/bin/bash) failed` quando não há distro
instalada. Os helpers comuns (achar o container, rodar psql) estão em
[`docker-psql.mjs`](docker-psql.mjs).

## Apontar o app para o clone

**Não edite o `.env`.** Crie um `.env.local` na raiz do repo: o Next.js carrega `.env.local` com
precedência sobre o `.env` (a ordem é `process.env` > `.env.local` > `.env`), então produção fica
intacta e basta apagar o arquivo para voltar. Ele já está coberto pelo `.gitignore` (`.env.*`).

```ini
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

As três chaves saem de `pnpm db:local:status` (o `pnpm db:clone:rest` já imprime esse bloco pronto
no fim). São exatamente as variáveis que o app lê: `lib/supabase/client.ts`, `server.ts` e
`middleware.ts` usam as duas primeiras; `lib/supabase/admin.ts` usa a `SUPABASE_SERVICE_ROLE_KEY`
(`/api/users` e `/api/me/password`). Trocar só as duas primeiras faz essas rotas falharem com 401,
porque a chave de serviço de produção não vale no Auth local.

Evite `VARIAVEL=valor pnpm dev`: é sintaxe de shell POSIX e não funciona no PowerShell.

Como saber que você está no clone: as chamadas no DevTools → Network vão para `127.0.0.1:54321`, e
no clone feito por `db:clone:rest` a sua senha real **não** funciona (só a senha de teste). Os
testes E2E não são afetados pelo `.env.local`: o `playwright.config.ts` define as três variáveis do
mock server por conta própria, e `process.env` vence.

## O que vem no clone (`pnpm db:clone`)

Mesmo escopo do `scripts/backup.sh`:

- **schema `public` inteiro** — tabelas, views, funções, triggers, policies, grants e dados;
- **dados de `auth.users` e `auth.identities`** — os logins reais, com hash de senha (então você
  entra no app local com o seu e-mail e senha de produção).

Não vem a **configuração do projeto** Supabase (providers, URLs de redirect, segredos). O único
pedaço dela que o app precisa — o hook *Customize Access Token* apontando para
`public.custom_access_token_hook` — já está ligado no [`supabase/config.toml`](../../supabase/config.toml)
(linha 286), então o local reproduz as claims `app_role`/`tenant_id`. Storage também não vem, porque
o app não usa.

## Aplicar as migrations no clone, na ordem

A ordem **não é a numérica**: os cabeçalhos das migrations declaram as dependências (a `016` usa
funções da `019` e da `020`).

```bash
# Fase 3 — já em produção
pnpm db:sql scripts/013_create_profiles.sql
pnpm db:sql scripts/014_auth_helpers.sql
pnpm db:sql scripts/015_rewrite_policies.sql
pnpm db:sql scripts/017_indexes.sql
pnpm db:sql scripts/018_backfill_admin.sql

# Fase 6 — ainda não em produção
pnpm db:sql scripts/019_fix_missing_rls.sql
pnpm db:sql scripts/020_vendor_policies.sql
pnpm db:sql scripts/016_vendor_views.sql
pnpm db:sql scripts/021_fix_profile_trigger.sql
pnpm db:sql scripts/022_vendedor_por_pessoa.sql
```

**Antes da `022`**, veja quais cadastros vão ser fundidos — a fusão é por nome e a decisão é sua:

```bash
pnpm db:sql -c "select lower(btrim(name)) as nome, count(*) as cadastros, string_agg(company_id::text, ', ') as empresas from public.salespersons group by 1 having count(*) > 1 order by 1"
```

E tire a foto dos números antes, para comparar depois (uma empresa por vez):

```bash
pnpm db:sql -c "select company_id, count(*) vendas, sum(total_price) total from public.sales where status = 'concluída' group by 1 order by 1"
```

Voltar atrás: `pnpm db:sql scripts/rollback/022_vendedor_por_pessoa.down.sql` (restaura pelo
`salespersons_merge_map` e devolve a `commission_summary()` da `016` sozinho).

## Montar o banco de homologação (para o preview da Vercel)

O preview da Vercel precisa de um Supabase **separado**: a `022` remove colunas que o app em
produção ainda lê, então os dois schemas não convivem. O caminho leva os dados reais para lá **sem
a senha do Postgres de produção** — quem leu produção foi o `db:clone:rest`, por HTTPS.

```bash
# 1. clone local com os dados de produção, no estado de hoje (Fase 3 aplicada)
pnpm db:clone:rest
pnpm db:sql scripts/013_create_profiles.sql   # … até a 018

# 2. enviar para o projeto de homologação
$env:HOMOLOG_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
pnpm db:enviar-homolog

# 3. no painel do homolog: Authentication > Hooks > Customize Access Token
#    → public.custom_access_token_hook   (configuração de projeto; não vem em dump)

# 4. ensaiar a janela de produção, uma migration por vez
pnpm db:sql:homolog scripts/019_fix_missing_rls.sql
pnpm db:sql:homolog scripts/020_vendor_policies.sql
pnpm db:sql:homolog scripts/016_vendor_views.sql
pnpm db:sql:homolog scripts/021_fix_profile_trigger.sql
pnpm db:sql:homolog scripts/022_vendedor_por_pessoa.sql
```

**Se o clone local já estiver com a Fase 6 aplicada**, o destino nasce pronto: não rode as
migrations do passo 4, elas vão falhar com "already exists" (são transacionais, então nada fica pela
metade). Para ensaiar a janela de produção de verdade, remonte o clone no estado de produção antes
de enviar: `pnpm db:local:apagar && pnpm db:local && pnpm db:clone:rest` e as migrations 013–018.

O gatilho `on_auth_user_created` mora em `auth.users` e **não vem** no dump do `public` — o script
o recria no destino depois do restore.

`SEM_LOGINS=1 pnpm db:enviar-homolog` não envia `auth.users` — use se não quiser hash de senha real
no ambiente de teste; depois crie os logins com `scripts/manual/fase-2/seed-usuarios.mjs`.

**A trava anti-produção** (`homolog.mjs`) recusa a `HOMOLOG_DB_URL` quando ela contém o
identificador do projeto do `.env`, em qualquer formato (pooler `postgres.<ref>` ou direto
`db.<ref>.supabase.co`), quando aponta para `localhost` e quando usa a porta 6543. Os dois
comandos também exigem terminal interativo e abortam em CI.

## Testes de banco (`testes-banco/`)

```bash
pnpm db:test:vinculo
```

Sobem **o seu próprio Postgres descartável**, não o clone: aplicam as migrations do repo na ordem
real (base → Fase 3 → `019`, `020`, `016`), semeiam dados **sintéticos** e verificam as regras.
Assim o resultado é determinístico e os dados reais do clone não são tocados nem sujados.

`vinculo-usuario-vendedor.mjs` cobre o vínculo login ↔ vendedor (21 casos): vínculo múltiplo em
empresas diferentes, `unique (salesperson_id)`, RLS de escrita, `my_salesperson_ids()`,
`my_company_ids()`, `vendor_sales`, `commission_summary()` (comissão do colega nula), desativação
e remoção em cascata, e o gatilho on_auth_user_created que o POST /api/users depende.

O relatório tem três estados: **OK**, **FALHA** e **LACUNA** — esta última trava um comportamento
atual que não é o desejado (hoje: o banco aceita vincular vendedor de outro inquilino, e o gatilho do perfil não pega o UPDATE do GoTrue — ver docs/fase-6/vinculo-login-vendedor.md). Lacuna não
derruba a suíte, mas se o comportamento mudar ela vira **MUDOU**, avisando que é hora de promover o
caso a `checar`.

## Se o login falhar com "Database error querying schema"

Clone feito **antes** de 09/10/2026: as colunas de token de `auth.users` ficaram `NULL` em vez de
`''`, e o GoTrue lê essas colunas como string não-nula (Go). O login responde 500 e o log do
container mostra `Scan error on column index 3, name "confirmation_token": converting NULL to
string is unsupported`. Conserto, uma vez só:

```bash
pnpm db:sql scripts/local/corrige-auth-tokens.sql
```

Clones novos já nascem certos (`AUTH_TOKEN_COLUMNS` em [`clone-rest-sql.mjs`](clone-rest-sql.mjs)).

Para ver o erro de verdade por trás de qualquer falha de login, o log do Auth é o lugar:

```bash
docker logs supabase_auth_Clock-Society --tail 30
```

Se a mensagem citar o hook ou `custom_access_token_hook`, falta aplicar a `013` e a `014`.

## Cuidados

1. **Os despejos têm dados reais** (e, no `db:clone`, hashes de senha). Saem em `backups/`, que
   está no `.gitignore`. Não versione, não suba para lugar nenhum.
2. **Apague o clone quando terminar** (`pnpm db:local:apagar`). O volume do Docker com dados reais
   não deve ficar de pé por dias.
3. O script **se recusa a restaurar por cima** de um `public` que já tenha tabelas, e **se recusa**
   a aceitar uma `SUPABASE_DB_URL` que aponte para `localhost` (seria clonar o local nele mesmo).
4. Alguns `pg_restore: error` são esperados (schema/extensão que já existe, tabelas de `auth` que a
   versão local não tem, como `scim_*`). O que vale é o **retrato** impresso no fim: as contagens de
   `public.*`, `auth.users` e `auth.identities` têm que bater com produção.
5. Para os checklists manuais de banco, siga daqui em diante o
   [`ensaio-local.md`](../../docs/fase-3/ensaio-local.md) (passos 4 em diante) e o
   [`fase-5-checklist-banco-vendedor.md`](../../docs/manual-checklists/fase-5-checklist-banco-vendedor.md).
