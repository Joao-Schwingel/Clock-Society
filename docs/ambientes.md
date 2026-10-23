# Ambientes: clonar produção e publicar em homologação

> **Procedimento manual, executado por um humano.** Nenhum passo daqui roda em CI ou por um agente
> de IA (Fase 1 §1). Produção é usada **somente para leitura**, sempre.
>
> Referência dos comandos e detalhes de cada script: [`scripts/local/README.md`](../scripts/local/README.md).

## Os três ambientes

| | Onde | Para quê | Dados |
|---|---|---|---|
| **Clone local** | Supabase no Docker, na sua máquina | desenvolver, ensaiar migration, rodar os checklists manuais | cópia descartável de produção |
| **Homologação** | projeto Supabase separado | preview da Vercel, ensaio da janela de produção, validação do time | cópia de produção, enviada por você |
| **Produção** | o projeto do `.env` | — | os dados reais |

Nunca aponte um app novo para um banco antigo, nem o contrário. Quando a migration remove coluna —
como a `022` faz — os dois **não convivem**: o app em produção quebra no instante em que a migration
é aplicada, então banco e app viram juntos, numa janela combinada.

---

# Parte 1 — Clonar produção no local

## Pré-requisitos

- Docker Desktop aberto. A CLI do Supabase é devDependency do projeto, não precisa instalar nada.
- O `.env` do repo, com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Qual dos dois caminhos

```bash
pnpm db:clone        # via pg_dump — precisa da senha do Postgres de produção
pnpm db:clone:rest   # via API REST — só a service_role key
```

| | `db:clone` | `db:clone:rest` |
|---|---|---|
| Senha do Postgres | **sim** | não |
| Schema | cópia fiel de produção | montado pelas migrations; divergência é **relatada** |
| Funções, triggers, policies | vêm de produção | vêm das migrations |
| Senhas dos logins | as reais | uma senha de teste para todos (`clone-local`) |

Se você tem a senha, prefira o `db:clone`: é cópia fiel. Sem ela, o `db:clone:rest` resolve —
foi assim que este projeto operou até hoje.

```bash
pnpm db:clone:rest
```

Ele sobe o Supabase local se preciso, lê produção, carrega no clone e imprime o **retrato**
(contagem por tabela) para você comparar, além de um **relatório de divergência** entre o schema de
produção e o que as migrations criam.

## Deixar o clone igual a produção

O `db:clone:rest` monta o schema até a `011`. Produção hoje está na Fase 3, então complete:

```bash
pnpm db:sql scripts/013_create_profiles.sql
pnpm db:sql scripts/014_auth_helpers.sql
pnpm db:sql scripts/015_rewrite_policies.sql
pnpm db:sql scripts/017_indexes.sql
pnpm db:sql scripts/018_backfill_admin.sql
```

A partir daqui o clone é o espelho de produção. Para **ensaiar a Fase 6**, aplique por cima, nesta
ordem (não é a numérica — os cabeçalhos declaram as dependências):

```bash
pnpm db:sql scripts/019_fix_missing_rls.sql
pnpm db:sql scripts/020_vendor_policies.sql
pnpm db:sql scripts/016_vendor_views.sql
pnpm db:sql scripts/021_fix_profile_trigger.sql
pnpm db:sql scripts/022_vendedor_por_pessoa.sql
```

**Antes da `022`**, veja o que será fundido — a fusão é por nome e a decisão é humana:

```bash
pnpm db:sql -c "select lower(btrim(name)) as nome, count(*) from public.salespersons group by 1 having count(*) > 1 order by 1"
```

E tire o retrato dos números, para comparar depois:

```bash
pnpm db:sql -c "select company_id, count(*) vendas, sum(total_price) total from public.sales where status = 'concluída' group by 1 order by 1"
```

Rode a mesma consulta depois da `022`: **tem que dar idêntico**. É o mesmo oráculo que o
`pnpm db:test:vinculo` automatiza.

## Rodar o app contra o clone

**Não edite o `.env`.** Crie um `.env.local` na raiz — o Next.js dá precedência a ele, e ele já
está coberto pelo `.gitignore`:

```ini
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

As três saem de `pnpm db:local:status` (o `db:clone` já imprime o bloco pronto). **São três**: sem
a `SUPABASE_SERVICE_ROLE_KEY` do local, a tela de Usuários e a troca de senha respondem 401.

Para voltar a produção, apague o `.env.local` e reinicie o `pnpm dev`.

Evite `VARIAVEL=valor pnpm dev`: é sintaxe de shell POSIX e não funciona no PowerShell.

## Ao terminar

```bash
pnpm db:local:parar    # para e PRESERVA os dados
pnpm db:local:apagar   # derruba e APAGA — o clone tem dados reais
```

O clone guarda dados de clientes e, no caminho `db:clone`, hashes de senha. Não deixe de pé por dias.

---

# Parte 2 — Publicar em homologação

Serve para o preview da Vercel e para ensaiar a janela de produção num Supabase de verdade — com
pooler, GoTrue real e os limites de uma instância free, que o container local não reproduz.

## 1. Criar o projeto

Um segundo projeto no Supabase (o plano free permite 2 por organização). **Anote a senha do
Postgres na criação** — não dá para recuperar depois.

Guarde também, de Project Settings → API: a URL, a `anon` e a `service_role`.

## 2. Enviar o clone

```powershell
$env:HOMOLOG_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
pnpm db:enviar-homolog
```

A URL vem de Project Settings → Database → Connection string → URI, a do **pooler na porta 5432**
(modo session). A porta 6543 não funciona com `pg_dump`/`pg_restore`, e o script recusa.

A variável vive só naquela janela do PowerShell. **Não adianta pôr no `.env`**: é um script Node
puro, ele não carrega `.env`.

O script mostra o destino (senha mascarada) e o retrato do que vai, e espera você digitar `sim`.

`SEM_LOGINS=1 pnpm db:enviar-homolog` não envia `auth.users` — use se não quiser hash de senha real
no ambiente de teste, e depois crie os logins com `scripts/manual/fase-2/seed-usuarios.mjs`.

**A trava anti-produção** recusa a URL quando ela contém o identificador do projeto do `.env`, em
qualquer formato (pooler `postgres.<ref>` ou direto `db.<ref>.supabase.co`), quando aponta para
`localhost` e quando usa a porta 6543.

## 3. Ligar o hook de token

**Painel do homologação → Authentication → Hooks → Customize Access Token (JWT) Claims** →
habilitar → tipo **Postgres** → schema **public** → função **`custom_access_token_hook`**.

Isso é configuração de projeto, **não vem em dump nenhum**. Localmente está declarado em
`supabase/config.toml`; na nuvem é esse formulário.

Sem ele o login funciona, o token sai **sem** `app_role`/`tenant_id`, e todo mundo cai em `/403` —
inclusive o admin. Nada na tela diz que a causa é um toggle do painel.

Se o seletor de função vier vazio, é porque o banco ainda não foi carregado: faça o passo 2 antes.

## 4. Aplicar as migrations

```powershell
pnpm db:sql:homolog scripts/019_fix_missing_rls.sql
pnpm db:sql:homolog scripts/020_vendor_policies.sql
pnpm db:sql:homolog scripts/016_vendor_views.sql
pnpm db:sql:homolog scripts/021_fix_profile_trigger.sql
pnpm db:sql:homolog scripts/022_vendedor_por_pessoa.sql
```

Use o psql de dentro do container local, então não precisa instalar cliente Postgres. A mesma trava
anti-produção vale aqui.

**Se o clone enviado já estiver com a Fase 6 aplicada, pule este passo** — o destino já nasce
pronto, e as migrations vão falhar com "already exists". São todas transacionais, então nada fica
pela metade, mas o erro assusta à toa.

Confira o estado ao final:

```powershell
pnpm db:sql:homolog -c "select to_regclass('public.salesperson_companies') as m022, to_regclass('public.vendor_sales') as m016, (select count(*) from public.salespersons) as pessoas, (select count(*) from public.sales) as vendas, (select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) as gatilho"
```

## 5. Apontar o preview da Vercel

Em **Settings → Environment Variables**, as três no escopo **Preview**, de preferência limitadas à
branch:

```
NEXT_PUBLIC_SUPABASE_URL        → https://<ref-homolog>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   → anon do homolog
SUPABASE_SERVICE_ROLE_KEY       → service_role do homolog
```

**Cadastre antes do push.** As `NEXT_PUBLIC_*` são embutidas no bundle **no build**; se você
empurrar primeiro, o preview sai apontando para produção.

Depois do push, a primeira conferência no preview: DevTools → Network, as chamadas têm que ir para
o host do homologação.

---

# Problemas conhecidos

| Sintoma | Causa | Solução |
|---|---|---|
| `/403` para todo mundo, inclusive admin | hook de token não habilitado no projeto | Parte 2, passo 3 |
| Login falha com "Database error querying schema" | clone antigo com colunas de token `NULL` em `auth.users` | `pnpm db:sql scripts/local/corrige-auth-tokens.sql` |
| Criar usuário falha e o login some do Auth | perfil não nasceu; falta a `021` ou o `ensureProfile` | aplique a `021`; detalhes em [`fase-6/vinculo-login-vendedor.md`](fase-6/vinculo-login-vendedor.md) §3 |
| Criar usuário pelo painel não cria perfil | gatilho `on_auth_user_created` não veio no dump (mora em `auth.users`, fora do `public`) | o `db:enviar-homolog` recria; ou aplique a `021` |
| `already exists` ao aplicar migration | o banco já está naquele estado | pule a migration; nada ficou pela metade (são transacionais) |
| `execvpe(/bin/bash) failed` | o `bash` do PATH no PowerShell é o do WSL | já resolvido: os scripts são Node, não shell |
| Dump binário corrompido | `>` do PowerShell escreve em modo texto | use os scripts (`db:clone`, `db:enviar-homolog`), que tratam binário |
| `Unable to acquire lock at .next\dev\lock` | `pnpm dev` e o `next dev` do Playwright disputam o `.next` | pare o `pnpm dev` antes de `pnpm test:e2e` |
| Porta 3100/3101 ocupada no E2E | mock server órfão de uma execução anterior | mate o processo da porta e rode de novo |

# Antes de aplicar em produção

1. **Resetar a senha do Postgres**, se você não a tiver — sem ela não dá para rodar o
   `scripts/backup.sh`, e **rollback não substitui backup**. Resetar não afeta o app (que usa
   anon/service_role), só quem conecta direto no banco.
2. Backup (`./scripts/backup.sh`) guardado fora do repositório.
3. Retrato dos números antes.
4. Janela com app e banco virando juntos, quando a migration quebra compatibilidade.
5. Retorno: *redeploy* do deploy anterior na Vercel **primeiro**, depois o `.down.sql`, em ordem
   inversa. O app antigo precisa do schema antigo.

O runbook detalhado da Fase 3 está em [`fase-3/runbook.md`](fase-3/runbook.md) e serve de modelo.
