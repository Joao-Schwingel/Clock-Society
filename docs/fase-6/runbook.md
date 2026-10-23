# Runbook de implantação — Fase 6 (papel vendedor + vendedor por pessoa)

> **Executado à mão, por um humano, com a janela combinada.** Nenhum passo aqui roda em CI ou por
> um agente de IA. Modelo: [`fase-3/runbook.md`](../fase-3/runbook.md). Portão de homologação:
> [`fase-6-implementacao-vendedor.md`](../../specs/release-2/fase-6-implementacao-vendedor.md) §4.
>
> Ambientes e comandos: [`ambientes.md`](../ambientes.md).

## Não é "só aplicar as migrations"

São **três** coisas, e a terceira é a que machuca:

| Bloco | O que falta | Onde |
|---|---|---|
| Banco | `019` → `020` → `016` → `021` → `022` | SQL Editor de produção |
| Vercel | `SUPABASE_SERVICE_ROLE_KEY` no escopo **Production** | Settings → Environment Variables |
| App | **61 commits**: o `main` é anterior à Fase 3 | merge da branch no `main` |
| Painel do Supabase | **nada** — o hook de token e o auto-cadastro já foram feitos em 03/10/2026 | — |

### O que já está em produção hoje

- **Banco:** Fase 3 aplicada em 03/10/2026 (`013`–`018`), hook `custom_access_token_hook` ligado,
  auto-cadastro desligado. Registro no runbook da Fase 3.
- **App:** o deploy da Fase 3 foi **adiado** naquela janela (decisão do responsável). O `main` não
  tem `lib/auth`, nem `lib/users`, nem `/vendedor`, e seus `scripts/` param na `010`. Produção roda
  o app **anterior ao login por papéis**, sobre o banco da Fase 3 — que é compatível com ele.

Portanto esta janela publica, de uma vez, o app das Fases 3, 5 e 6: guarda de rotas por papel,
troca de senha obrigatória, tela de Usuários, área `/vendedor` e o dashboard sobre
`commission_summary()`. Não é um deploy incremental.

### A incompatibilidade que define a janela

A `022` remove `salespersons.company_id` e `salespersons.commission_percentage`. O app que está em
produção lê as duas:

| Arquivo em `main` | Uso |
|---|---|
| `components/dashboard/settings-modal.tsx` | grava e exibe `company_id` (70, 98, 162); lê e grava `commission_percentage` (71, 99) |
| `components/dashboard/sales-form.tsx:153,252,311` | filtra o seletor de vendedor por `.eq("company_id", …)` |

Os dois sentidos quebram:

- **app antigo + schema novo** → Configurações e o seletor de vendedor da venda falham com `42703`
  (coluna inexistente). São erros de leitura: nada é gravado errado.
- **app novo + schema antigo** → dashboard, Usuários e `/vendedor` falham, porque
  `salesperson_companies` e `salespersons.profile_id` ainda não existem.

Não há ordem indolor: `022` e o deploy são **um único passo**, com alguns minutos de tela quebrada
no meio. Faça fora do horário de uso.

As outras quatro são seguras com o app antigo:

- **`019`** liga RLS em `sale_items`/`sale_salespersons` e põe `security_invoker` nas views antigas.
  As políticas do admin (`015`) já cobrem o inquilino; A-DB-04 foi conferida em produção em 03/10.
  O `revoke` do `anon` não afeta o app, que só fala com o PostgREST depois do login.
- **`020`** só adiciona políticas de leitura do vendedor e 4 linhas em `role_permissions`.
- **`016`** só cria objetos novos (`vendor_sales`, `commission_summary()`, `sale_salespersons_for_vendor()`);
  não toca nas views antigas.
- **`021`** só troca o gatilho `on_auth_user_created` para rodar também no `update` de
  `raw_app_meta_data`. O app antigo não cria usuários.

## Pré-requisitos (antes da janela)

- [ ] **Senha do Postgres de produção** em mãos. Se não tiver, resete em Project Settings →
      Database → Reset database password. Sem ela não há backup, e **rollback não substitui
      backup**. Resetar não afeta o app (que usa anon/service_role).
- [ ] `pnpm db:backup` executado, par de dumps guardado **fora** do repositório. Precisa do Docker
      aberto e usa o `pg_dump` do container (o `scripts/backup.sh` exige `pg_dump` no PATH, que no
      Windows não existe). Produção só é lida
- [ ] Retrato dos números **antes**, guardado fora do repositório (SQL abaixo)
- [ ] Lista de fusão da `022` conferida **nos dados de produção** — a fusão é por nome e a decisão é
      humana (SQL abaixo)
- [ ] As três guardas da `022` conferidas em produção (SQL abaixo). Elas também abortam a migration,
      mas é melhor saber antes da janela
- [ ] Checklist MANUAL da Fase 5 ([`fase-5-checklist-banco-vendedor.md`](../manual-checklists/fase-5-checklist-banco-vendedor.md))
      executado **em homologação**, com os resultados anexados ao PR
- [x] Ensaio no **clone local** com os dados de produção: `019 → 020 → 016 → 021 → 022` na ordem,
      oráculos antes/depois e ensaio do retorno — feito em 23/10/2026, ver "Registro" no fim
- [ ] Ensaio em **homologação** (opcional, se quiser o preview com os dados novos): mesmo roteiro,
      partindo do estado de produção. Enviar o clone já migrado **não** é ensaio
- [ ] No ensaio, com o **app antigo** sobre o banco já com a `019`: criar e editar uma venda com
      itens e vendedor. A `019` liga RLS em `sale_items`/`sale_salespersons`, onde o app antigo
      escreve; é o único caminho de escrita que muda de regra antes da `022`
- [ ] `pnpm db:test:vinculo` verde (oráculo antes/depois da `022` + ensaio do rollback)
- [ ] CI verde na branch; local: `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`,
      `pnpm build`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` cadastrada no escopo **Production** da Vercel **antes** do merge.
      A Vercel congela as variáveis no build: cadastrar depois exige novo deploy. Sem ela,
      `/api/users` responde 500 e a tela de Usuários não abre
- [ ] Deploy anterior identificado na Vercel, para *redeploy* imediato em caso de retorno
- [ ] Ninguém usando o sistema na hora combinada

### SQL dos pré-requisitos (tudo leitura)

Inquilino e admin:

```sql
select id, full_name from public.profiles where role = 'admin';
```

Retrato por empresa (o número que não pode mudar):

```sql
select c.name, s.status, count(*) vendas, sum(s.total_price) total
  from public.sales s join public.companies c on c.id = s.company_id
 group by 1, 2 order by 1, 2;

select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name),
                                            false, true, '')))[1]::text::bigint as linhas
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;
```

Quem vai ser fundido — **confira nome por nome**:

```sql
select user_id, lower(btrim(name)) as nome, count(*),
       string_agg(company_id::text, ', ') as empresas
  from public.salespersons group by 1, 2 having count(*) > 1 order by 2;
```

As três guardas da `022` — as três têm que devolver **0**:

```sql
-- (a) a mesma pessoa duas vezes na mesma venda
select count(*) from public.sale_salespersons a
  join public.sale_salespersons b on b.sale_id = a.sale_id and b.salesperson_id <> a.salesperson_id
  join public.salespersons sa on sa.id = a.salesperson_id
  join public.salespersons sb on sb.id = b.salesperson_id
 where sa.user_id = sb.user_id and lower(btrim(sa.name)) = lower(btrim(sb.name));

-- (b) venda com vendedor de outra empresa
select count(*) from public.sale_salespersons ss
  join public.sales s on s.id = ss.sale_id
  join public.salespersons sp on sp.id = ss.salesperson_id
 where s.company_id <> sp.company_id;

-- (c) login apontando para pessoas diferentes
select count(*) from (
  select ps.profile_id from public.profile_salespersons ps
    join public.salespersons sp on sp.id = ps.salesperson_id
   group by ps.profile_id
  having count(distinct (sp.user_id, lower(btrim(sp.name)))) > 1) t;
```

## Janela

Cada migration vai no **SQL Editor → New query**, o arquivo inteiro colado (ele já traz
`begin;`/`commit;`), uma aba por migration. Esperado: `Success. No rows returned` — nenhuma das
cinco devolve linhas.

> **O aviso "Potential issues detected".** O editor avisa sobre operações destrutivas (a `022` faz
> `delete`, `drop column`, `drop table`) e sobre tabela criada sem RLS. Clique em **`Run without
> RLS`**. O botão `Run and enable RLS` **acrescenta SQL que não está na migration** — e a RLS que
> este projeto quer já está escrita nela (regra "schema só por migration").
>
> **Leia qual tabela o aviso cita:**
> - **`_fusao`** → falso positivo. É a tabela **temporária** da `022` (`on commit drop`): vive em
>   `pg_temp_*`, só a própria sessão a enxerga e some no `commit`. Siga.
> - **Qualquer outra** → pare. A correção vai no arquivo, não no botão. Foi assim que se achou, em
>   23/10/2026, que a `salespersons_merge_map` nascia sem RLS e com privilégios de `authenticated`
>   — corrigido dentro da `022`.

| # | Passo | Verificação imediata |
|---|---|---|
| 1 | `pnpm db:backup` | Par de dumps gerado (nenhum vazio), guardado fora do repo |
| 2 | Retrato **antes**: o `-retrato.txt` do passo 1 e o retrato por empresa (SQL acima). O do `commission_summary()` só dá para tirar depois do passo 5 — a função nasce na `016` | Salvo fora do repo |
| 3 | `scripts/019_fix_missing_rls.sql` | `rowsecurity` = true em `sale_items`/`sale_salespersons`; app antigo **continua funcionando** — abra Vendas e o dashboard |
| 4 | `scripts/020_vendor_policies.sql` | 4 linhas novas em `role_permissions`. A migration **reescreve o `custom_access_token_hook`**: saia e entre de novo no app antigo e confirme que o login funciona |
| 5 | `scripts/016_vendor_views.sql` | `vendor_sales` e `commission_summary()` existem. **Tire aqui** o retrato do `commission_summary()` (abaixo): é ele que você compara depois da `022` |
| 6 | `scripts/021_fix_profile_trigger.sql` | `on_auth_user_created` em `auth.users` com `insert or update of raw_app_meta_data` |
| 7 | Reler a lista de fusão. **`scripts/022_vendedor_por_pessoa.sql`** | Não abortou; `salespersons` com 1 linha por pessoa; `salespersons_merge_map` com os fundidos; **retrato por empresa idêntico ao do passo 2** |
| 8 | Merge da branch no `main` → deploy de produção na Vercel | Build verde. Entre o 7 e o fim deste passo, Configurações e o seletor de vendedor do app antigo estão quebrados |
| 9 | Login do admin | Cai em `/dashboard`; números iguais ao retrato; a aba **Usuários** abre (se der 500, é a variável do passo de pré-requisito) |
| 10 | Conferir Configurações: as pessoas, com as empresas marcadas | Cada pessoa tem as empresas que tinha como cadastros separados |
| 11 | Criar os logins dos vendedores pela tela de Usuários | Cada um entra, troca a senha e vê só as próprias vendas em `/vendedor` |
| 12 | Retrato **depois** e diff com o do passo 2 | Nenhuma diferença |

> **Por que a `022` vem antes do merge:** se uma guarda abortar, nada foi aplicado e o app antigo
> continua intacto — você reagenda. Se o app novo já estivesse publicado, ele estaria quebrado
> sobre o schema antigo, sem nada para reverter no banco.

Retrato do `commission_summary()` (passos 5 e 12). A função é `security definer` e exige as
claims; no SQL Editor, simule o admin dentro de uma transação que termina em `rollback`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<id do admin>","role":"authenticated",
  "app_metadata":{"app_role":"admin","tenant_id":"<id do admin>"}}';
select salesperson_name, sales_count, total_sales, total_costs, total_commission
  from public.commission_summary('<id da empresa>', 2026, array[1,2,3,4,5,6,7,8,9,10,11,12])
 order by 1;
rollback;
```

A saída tem que ser **idêntica linha a linha** antes e depois da `022` — foi o que o ensaio com o
clone de produção mostrou (23/10/2026). Como cada pessoa tinha no máximo um cadastro por empresa, a
fusão não muda nem a lista nem os valores: muda só qual id está por trás de cada nome.

Um segundo oráculo, mais simples e que não depende da `016` — pode ser tirado já no passo 2:

```sql
select lower(btrim(sp.name)) as nome, count(*) as vinculos, sum(ss.commission_percent) as soma_pct
  from public.sale_salespersons ss
  join public.salespersons sp on sp.id = ss.salesperson_id
 group by 1 order by 1;
```

Também tem que dar idêntico: a `022` só reaponta ids, os nomes e os percentuais da venda ficam.

## Retorno

**Gatilho:** qualquer divergência nos números do admin, ou a tela de Usuários/`/vendedor`
inoperante, sem solução em 30 minutos.

1. *Redeploy* do deploy anterior na Vercel (app antigo) — **primeiro**. O app antigo precisa do
   schema antigo.
2. Ordem inversa, cada uma com o seu `scripts/rollback/*.down.sql`:
   `022` → `021` → `016` → `020` → `019`.
3. Conferir o retrato de novo.

O `022.down` reconstrói os cadastros a partir de `salespersons_merge_map` e devolve cada linha de
`sale_salespersons` ao cadastro **daquela empresa** — é determinístico, porque a venda sabe a
empresa. Perde-se: acessos criados depois da `022` para empresas que não estavam no mapa (viram
cadastro novo, sem histórico) e o `commission_percentage`, que volta com o valor da fusão — nenhum
cálculo o usa.

**Depois de rodar o `022.down`, confira estas duas** (as duas têm que dar 0):

```sql
-- dois cadastros do mesmo nome na mesma empresa
select count(*) from (
  select name, company_id from public.salespersons group by 1,2 having count(*) > 1) d;

-- venda com vendedor de outra empresa (se > 0, a 022 nem poderia ser reaplicada)
select count(*) from public.sale_salespersons ss
  join public.sales s on s.id = ss.sale_id
  join public.salespersons sp on sp.id = ss.salesperson_id
 where s.company_id <> sp.company_id;
```

Era exatamente aqui que o `.down` tinha um defeito, encontrado no ensaio de 23/10/2026: ele devolvia
o sobrevivente para a empresa de um duplicado (escolhia "o acesso mais antigo", e a `022` cria todos
os acessos com o mesmo `created_at`). Nos dados de produção dava 5 cadastros duplicados e 397 vendas
com vendedor de outra empresa. Corrigido — o sobrevivente volta para a única empresa dele que **não**
está no mapa de fusão — e coberto por `M-25`/`M-26` em `pnpm db:test:vinculo`.

Se o retorno pelo `.down` não bastar, é o backup do passo 1. **Rollback não substitui backup.**

## Depois da janela

- [ ] Período de observação: números do admin conferidos no dia seguinte
- [ ] Logins dos vendedores criados e entregues; cada um trocou a senha
- [ ] Registro preenchido abaixo, com as evidências
- [ ] `backups/` da janela guardado fora do repositório e removido da máquina

## Registro

| Data | Ambiente | Executado por | Passos OK | Observações |
|---|---|---|---|---|
| 23/10/2026 | Clone local (dados de produção de hoje: 740 vendas, 787 vínculos, 18 cadastros) | João + Claude Code | 3 a 7, mais o ensaio do retorno | Ver abaixo |
| | Homologação | | | |
| | **Produção** | | | |

**Ensaio de 23/10/2026 (clone local, `pnpm db:clone:rest` + `013`–`018`):**

- `019 → 020 → 016 → 021 → 022` aplicadas na ordem, sem erro. A `020` recriou as duas views antigas
  (`create or replace`) sem reclamar.
- Fusão: **18 cadastros → 7 pessoas**, 18 acessos, 11 no mapa. Nenhum nome ambíguo; cada pessoa ficou
  com as mesmas empresas que tinha como cadastros separados.
- Oráculos **idênticos** antes e depois: `commission_summary()` das 3 empresas (18 linhas, linha a
  linha) e as somas de `sale_salespersons` por nome. Retrato por empresa inalterado.
- `0` vínculos órfãos; `profile_salespersons`, `company_id` e `commission_percentage` removidos.
- Ensaio do retorno: **achou um defeito no `022.down`** (ver "Retorno"), corrigido e re-testado. O
  ciclo completo `022 → down → 022` foi feito duas vezes, com os oráculos batendo no fim.
- **Segundo achado, do linter do SQL Editor:** `salespersons_merge_map` nascia com RLS desligado e
  com `select/insert/update/delete` para `authenticated` (privilégio padrão do Supabase para tabela
  nova no `public`). Um vendedor leria nomes e percentuais antigos de todos os inquilinos e poderia
  apagar o insumo do rollback. A `022` agora liga RLS e revoga os privilégios; conferido no clone
  (`authenticated`: nenhum privilégio) e coberto por `M-27`.
