# Checklist MANUAL — Banco, papel admin (Fase 2 → executado na Fase 3)

> **Nunca automatizado. Nunca executado por um agente de IA. Nunca contra produção.**
> Executado à mão, por um humano, contra o Supabase **local** (descartável) ou de **homologação**,
> antes do merge/deploy de cada fatia da Fase 3. Não bloqueia o CI; bloqueia a saída da fatia.
> Spec: [`fase-2-casos-de-teste-admin.md`](../../specs/release-2/fase-2-casos-de-teste-admin.md) §5
> ("Banco" e A-TEN-01); fatias: [`fase-3-implementacao-admin.md`](../../specs/release-2/fase-3-implementacao-admin.md) §2.
>
> **Status: redigido na Fase 2, ainda não executado.** Os resultados entram na tabela "Registro de
> execução" no fim do documento e são anexados ao PR da fatia.

C-DB-01 e C-DB-02 são repetidos como A-DB-04 e A-DB-05. C-DB-04 e C-DB-05 **não** são substituídos
nesta release (ver "Fora do escopo").

## Antes de começar

1. Ambiente: **Supabase local** (via CLI) ou **homologação**. Nunca produção.
2. Dados de negócio de T1 e T2 carregados como na Fase 1 (mesmos cenários de `e2e/fixtures/`).
   Anote as contagens esperadas por tabela **antes** de aplicar as migrations — elas são o oráculo
   de A-DB-04.
3. Usuários e perfis da Fase 2 §4: rode, **à mão**, `node scripts/manual/fase-2/seed-usuarios.mjs`
   (depois de 013/014; ver [`scripts/manual/fase-2/README.md`](../../scripts/manual/fase-2/README.md)).
   Se o script avisar que `semperfil@t1` ganhou perfil pelo gatilho, remova essa linha à mão.
4. Salve `select * from pg_policies where schemaname = 'public'` antes das migrations (base do
   rollback de 015).

### Como simular um usuário no SQL Editor

Mesmo padrão do §8.3 do planejamento. Rode cada bloco numa transação e termine com `rollback`, para
que nenhum teste de escrita persista:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated","app_metadata":{"app_role":"admin","tenant_id":"<uuid-T1>"}}';
-- consultas do item
rollback;
```

- **Sem claims** (queda para `profiles`, A-DB-03): omita `app_metadata` do JSON.
- **Pelo caminho real (PostgREST + token do hook):** `node scripts/manual/fase-2/login-as.mjs <email>`.

Tabelas: `companies`, `salespersons`, `sales`, `sale_items`, `sale_salespersons`, `sale_costs`,
`costs`, `fixed_costs`, `contracts`, `inventory`. Views: `sales_with_details`, `sales_with_salespersons`.

---

## Antes das migrations — linha de base

### A-DB-04 (P1) — Regressão: contagens do admin nas 10 tabelas e nas 2 views

Como `admin@t1`, **antes** de qualquer migration e depois da fatia 3.3. As views seguem **sem**
`security_invoker` nesta release (fora do escopo; ver "Fora do escopo" abaixo).

| Tabela/view | Esperado (fixture) | Antes | Após 3.3 | OK? |
|---|---|---|---|---|
| `companies` | | | | |
| `salespersons` | | | | |
| `sales` | | | | |
| `sale_items` | | | | |
| `sale_salespersons` | | | | |
| `sale_costs` | | | | |
| `costs` | | | | |
| `fixed_costs` | | | | |
| `contracts` | | | | |
| `inventory` | | | | |
| `sales_with_details` | = `sales` | | | |
| `sales_with_salespersons` | = `sales` | | | |

Qualquer diferença = linha sumida sem erro (§7.6). Não seguir para a próxima fatia.

### Fora do escopo desta release

Registrados na issue #9, e **não** verificados aqui:

- **A-DB-09** (chave anônima não lê nada). Substituía o C-DB-04; o C-DB-04 continua valendo como
  registro da situação atual.
- A parte do **A-DB-06** sobre as views e sobre `sale_items`/`sale_salespersons` (substituía o
  C-DB-05, que continua valendo como registro).
- Ligar o RLS dessas duas tabelas e o `security_invoker` das views é **pré-requisito da Fase 6**.

## Fatia 3.2 — identidade (`013_create_profiles.sql`, `014_auth_helpers.sql`)

### A-DB-02 (P1) — Claims no token

- [ ] `login-as.mjs admin@t1.test` → `app_role = "admin"`, `tenant_id = <id do admin@t1>`
- [ ] `login-as.mjs semperfil@t1.test` → `app_role = null`, `tenant_id = null`
- [ ] Hook habilitado no painel (Auth > Hooks) apontando para a função da 014

### A-DB-03 (P1) — Funções auxiliares com e sem claims

Para `admin@t1`, rodar com o JSON **com** e **sem** `app_metadata`:

| Função | Com claims | Sem claims (queda para `profiles`) | Iguais? |
|---|---|---|---|
| `public.current_tenant_id()` | | | |
| `public.current_app_role()` | | | |
| `public.is_admin()` | | | |

> A função se chama `current_app_role()`, e não `current_role()` como no rascunho do planejamento:
> `current_role` é palavra reservada do SQL (achado 1 em [`docs/fase-2/README.md`](../fase-2/README.md)).
> Confira também que `select current_role;` (sem parênteses) continua devolvendo `authenticated`.

### A-DB-12 (P1) — `profiles`: leitura, escalada, recursão

- [ ] `admin@t1` lê os 3 perfis de T1 (`admin`, `admin2`, `vendedor-sem-vinculo`) e não o de T2
- [ ] `vendedor-sem-vinculo@t1` lê só o próprio perfil
- [ ] Cada usuário, pelo cliente, tenta `update profiles set role = 'admin'` / `tenant_id` / `is_active` / `must_change_password` no próprio perfil → **negado** (inclusive o admin, no próprio)
- [ ] Nenhuma consulta a `profiles` falha com `infinite recursion detected in policy` (§7.2)

### A-DB-13 (P2) — `role_permissions`

- [ ] Autenticado lê todas as linhas; as do admin batem com o catálogo §3.1 da spec
- [ ] `insert`/`update`/`delete` pelo cliente → negado

### A-DB-14 (P2) — `profile_salespersons` único por vendedor

- [ ] Vincular o mesmo `salesperson_id` a dois perfis → erro de unicidade (`23505`)

---

## Fatia 3.3 — políticas, índices, backfill (`015`, `017`, `018`)

### A-DB-01 (P1) — Backfill do admin atual

```sql
select id, tenant_id, role, is_active from public.profiles where id = '<id do admin atual>';
```

- [ ] `role = 'admin'`, `tenant_id = id`, `is_active = true`

### A-DB-04 (P1) — repetir a tabela da linha de base, coluna "Após 3.3"

### A-DB-05 (P1) — Admin escreve em tudo que o front escreve

Como `admin@t1`, dentro de `begin … rollback`: `insert`, `update` e `delete` de uma linha em cada tabela.

- [ ] `companies` · [ ] `salespersons` · [ ] `sales` · [ ] `sale_items` · [ ] `sale_salespersons`
- [ ] `sale_costs` · [ ] `fixed_costs` · [ ] `contracts` · [ ] `inventory`

### A-DB-06 (P1) — Outro inquilino: 0 linhas e escrita negada

Como `outro@t2`, contra os dados de T1, nas **8 tabelas com `user_id`**. As views, `sale_items` e
`sale_salespersons` ficam fora (issue #9):

- [ ] 0 linhas de T1 em cada uma das 8 tabelas
- [ ] `insert` com `user_id` de T1 → negado (erro de política, não "0 linhas")
- [ ] `update`/`delete` em linha de T1 → 0 linhas afetadas

### A-DB-07 (P1) — Usuário sem perfil

Como `semperfil@t1` (sem claims e sem linha em `profiles`):

- [ ] 0 linhas em todas as tabelas e views
- [ ] `insert`/`update`/`delete` negados

### A-DB-08 (P1) — Vendedor sem vínculo

Como `vendedor-sem-vinculo@t1` (`app_role = vendedor`, tenant T1, sem `profile_salespersons`):

- [ ] 0 linhas em todas as tabelas e views (D-6: na Fase 3 não há ramo do vendedor)
- [ ] `insert`/`update`/`delete` negados

### A-DB-10 (P1) — `user_id` nas inserções

- [ ] `insert` sem `user_id` como `admin2@t1` → a linha recebe `user_id = <id do admin@t1>` (o inquilino, não o id de quem inseriu)
- [ ] `insert` com `user_id` de T2 → negado
- [ ] `update … set user_id = <T2>` numa linha de T1 → negado

### A-DB-11 (P2) — Segundo admin do mesmo inquilino

- [ ] `admin2@t1` lê as mesmas contagens de A-DB-04
- [ ] `admin2@t1` escreve como em A-DB-05

### A-DB-15 (P2) — Toda política comentada

```sql
select p.polname, c.relname
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and obj_description(p.oid, 'pg_policy') is null;
```

- [ ] Resultado vazio

### A-DB-16 (P2) — Gatilho do vendedor "Site" sob as novas políticas

- [ ] Como `admin@t1`, inserir uma empresa (dentro de `begin … rollback`) → existe um `salespersons` "Site" para ela, com o `user_id` do inquilino

---

## Toda migration da fase

### A-DB-17 (P1) — Aplica, reverte, reaplica

Num banco **local descartável**, para cada migration da lista em
[`docs/fase-2/README.md`](../fase-2/README.md#migrations-da-fase-3):

| Migration | Aplica | Reverte | Reaplica | A-DB-04 depois de reaplicar |
|---|---|---|---|---|
| `011_reconcile_schema.sql` (no-op em produção) | | | | |
| `013_create_profiles.sql` | | | | |
| `014_auth_helpers.sql` | | | | |
| `015_rewrite_policies.sql` | | | | |
| `017_indexes.sql` | | | | |
| `018_backfill_admin.sql` | | | | |

---

## Fatia 3.4 — telas

### A-TEN-01 (P1) — Segundo admin vê os mesmos números

Duas sessões reais do app (navegadores diferentes), `admin@t1` e `admin2@t1`, mesmo ambiente.
Detecta qualquer uso remanescente do id do usuário logado (N3).

| Tela | Empresa | Período | `admin@t1` | `admin2@t1` | Iguais? |
|---|---|---|---|---|---|
| Dashboard — 6 cartões | A | 2026 | | | |
| Dashboard — cartões por vendedor | A | set/2026 | | | |
| Vendas — cartões e total de linhas | A | 2026 | | | |
| Estoque — 3 cartões | B | — | | | |
| Custos — Total Mensal Médio / Anual | A | — | | | |
| Contratos — totais | — | — | | | |
| Configurações — nº de vendedores | — | — | | | |

- [ ] Como `admin2@t1`, criar uma venda, um custo fixo, um contrato, um item de estoque e um vendedor → todos aparecem para `admin@t1` (inserção grava o inquilino, não o id de `admin2`)

---

## Registro de execução

| Data | Fatia | Ambiente (local/homologação) | Executado por | Itens OK | Itens com falha | PR |
|---|---|---|---|---|---|---|
| 28/09/2026 | 3.1–3.4 | Local (Supabase CLI + backup de produção de 28/09/2026) | Lucas, com apoio do Claude Code | A-DB-01, 02, 03, 04, 06, 07, 08, 10, 11, 12, 13, 15, 17 (018/017/015), A-TEN-01 | — | #8 |

**Notas do ensaio de 28/09/2026:**

- **A-DB-04:** contagens do admin idênticas antes e depois (companies 3, salespersons 18, sales 682,
  sale_items 754, sale_salespersons 722, sale_costs 2324, costs 0, fixed_costs 559, contracts 4,
  inventory 184, as 2 views 682).
- **A-DB-12:** sem o papel no token, o admin lê só o próprio perfil; com o papel (como o hook
  coloca), lê os 4 do inquilino. É o esperado: a política de `profiles` usa só as claims (§7.2).
- **A-DB-17:** testados os rollbacks da 018, 017 e 015 (voltam às 32 políticas da baseline) e a
  reaplicação. Os da 013 e 014 não foram executados.
- **Não executados:** A-DB-05 (coberto em parte pelo T3 do ensaio), A-DB-14 (Fase 6) e A-DB-16 (sem
  tela para criar empresa).
- Telas verificadas com Playwright contra o banco local (7 casos), fora do repositório e do CI.
- Achados fora do escopo: issues #11 (nº do pedido aceita texto) e #12 (`id="name"` duplicado).
