# Planejamento Técnico — Controle de Acesso por Papel (Admin / Vendedor)

**Projeto:** Clock Society — Sistema Financeiro
**Documento:** plano de execução interno
**Última atualização:** 12/09/2026
**Documento comercial correspondente:** `ORCAMENTO-ROLES.md`

> Este documento descreve **como** a feature será construída: ordem de execução, decisões de
> arquitetura, DDL, armadilhas conhecidas, matriz de testes e plano de retorno. As caixas de seleção
> servem como acompanhamento de execução. Os tempos são caixas de tempo para planejamento, não preço.

---

## Índice

1. [Objetivo e escopo](#1-objetivo-e-escopo)
2. [Estado atual do sistema](#2-estado-atual-do-sistema)
3. [Decisões de arquitetura](#3-decisões-de-arquitetura)
4. [Modelo de dados alvo](#4-modelo-de-dados-alvo)
5. [Ordem de execução e dependências](#5-ordem-de-execução-e-dependências)
6. [Plano de execução](#6-plano-de-execução)
7. [Armadilhas conhecidas](#7-armadilhas-conhecidas)
8. [Matriz de testes](#8-matriz-de-testes)
9. [Plano de retorno](#9-plano-de-retorno)
10. [Critérios de aceite](#10-critérios-de-aceite)
11. [Questões bloqueantes](#11-questões-bloqueantes)
12. [Backlog futuro](#12-backlog-futuro)
13. [Anexos](#anexo-a--inventário-de-arquivos)

---

## 1. Objetivo e escopo

Introduzir dois papéis — **admin** e **vendedor** — sobre um sistema hoje monousuário, de forma que
adicionar um terceiro papel no futuro seja configuração, não projeto.

**Total planejado:** 43 h distribuídas em 5 etapas.

### Decisões já fechadas

| Decisão | Escolha | Consequência técnica |
|---|---|---|
| Vendedor vê custo na listagem de vendas? | Não | `vendor_sales` sem colunas de custo |
| Visão de comissões | **Idêntica para admin e vendedor:** todos os vendedores da empresa, com total vendido, custos, lucro líquido e comissão | RPC `commission_summary()` compartilhada, `security definer`, retornando apenas agregados. Componente único no front-end |
| Painel de visão geral da empresa | Exclusivo do admin | Os 6 cartões do topo de `dashboard-view.tsx:242` (receita, receita líquida, comissões, custos de vendas, custos gerais, lucro) não aparecem para o vendedor |
| Vendedor escreve? | Não. Somente leitura | Apenas políticas de `SELECT`; tabela sem coluna de ações |
| Vendedor × empresas | N:N | Tabela de junção `profile_salespersons` |
| Entrega de senha | Senha temporária definida pelo admin | Flag `must_change_password` + tela de troca + guarda no middleware |
| Atribuição da venda | Vínculo do login ao registro em `salespersons` | Retroativo, sem alterar `sales` |
| Estoque do vendedor | Visão geral completa **com** `unit_cost` e `total_value`, somente leitura | Sem view dedicada: `SELECT` direto em `inventory`, restrito às empresas em que atua. Motivo de negócio: o vendedor precisa saber o custo para negociar desconto |

> **Trade-offs aceitos conscientemente:**
>
> 1. Sabendo o custo de compra do relógio (estoque) e o preço de venda, o vendedor consegue estimar a
>    margem de cada venda.
> 2. A visão de comissões mostra, por vendedor, total vendido, custos e lucro líquido. **Somando os
>    cartões de todos os vendedores, chega-se à receita e à receita líquida de vendas concluídas da
>    empresa** — aproximada, porque vendas compartilhadas contam duas vezes (Q2).
>
> O que continua de fato fora do alcance do vendedor: custos gerais (`fixed_costs`), contratos, lucro
> final, o detalhe venda a venda dos demais vendedores e as vendas pendentes deles.

---

## 2. Estado atual do sistema

### 2.1 Panorama

| Camada | Situação |
|---|---|
| Stack | Next.js 16 (App Router), Supabase, TypeScript, Tailwind v4, shadcn/ui |
| Auth | Supabase e-mail/senha, **um único usuário**, sem tela de cadastro |
| Autorização | Exclusivamente RLS, com a expressão `auth.uid() = user_id` |
| Acesso a dados | 100% do navegador, com a chave anônima |
| Código no servidor | **Nenhum.** Não existe `app/api/`, Server Action nem rota protegida |
| Tabelas | companies, sales, sale_items, sale_costs, sale_salespersons, salespersons, inventory, costs, fixed_costs, contracts |
| Views | `sales_with_details`, `sales_with_salespersons` |

**Implicação central:** como toda consulta sai do navegador, **o RLS é a única fronteira de segurança
que existe**. Esconder aba no React é UX, não proteção. Toda permissão precisa ser resolvida no banco.

### 2.2 Bloqueio estrutural

Todas as 10 tabelas têm `user_id → auth.users(id)`, e as políticas dizem `auth.uid() = user_id`.
Ou seja: **o usuário *é* o inquilino**. Criar um segundo login sem tocar nessa base produz um usuário
que não enxerga nenhuma linha — e que, pelas views atuais, enxergaria todas.

### 2.3 Achados críticos

| # | Achado | Onde | Risco |
|---|---|---|---|
| 1 | Views sem `security_invoker` | `scripts/views/sales_with_details.sql:3` | A view roda com privilégio do dono e **ignora RLS**. Com o vendedor, vazaria todas as vendas de todas as empresas |
| 2 | `sale_items` sem RLS habilitado e sem políticas | `scripts/alteracoes/10_01.sql` | Tabela aberta a qualquer usuário autenticado |
| 3 | `sale_salespersons` sem migration no repositório | — | Criada manualmente no painel; status de RLS desconhecido |
| 4 | Schema divergiu dos scripts | `sales.order_number`, `sales.payment_status`, `sales.entry_value`, `fixed_costs.qtdmonths`, tabela `sale_salespersons`, view `sales_with_salespersons` | Não é possível reescrever políticas com segurança sem o schema real mapeado |
| 5 | Auto-criação de empresas | `app/dashboard/page.tsx:18-30` | O primeiro login do vendedor duplicaria Clock Society / The Secret / Morfeus com dono errado |
| 6 | `/auth/sign-up` liberado no middleware | `lib/supabase/middleware.ts:5-11` | Rota pública sem página. Com papéis, o auto-cadastro precisa ser fechado — inclusive no painel do Supabase |
| 7 | Criação de usuário exige `service_role` | `.env` só tem URL + chave anônima | Obriga a introduzir a primeira camada de servidor do projeto |

### 2.4 Achados secundários

| # | Achado | Onde | Tratamento |
|---|---|---|---|
| 8 | Regra de comissão duplicada, pode divergir | `dashboard-view.tsx:200` e `sales-view.tsx:461-466` | Resolvido pela Etapa 1.5 |
| 9 | Venda compartilhada soma valor cheio para cada vendedor — o total da empresa não fecha com a soma dos vendedores | `dashboard-view.tsx:196-198` | Depende da Questão Q2 |
| 10 | Cadastro de vendedor grava `commission_percentage: 0` fixo, ignorando o formulário | `settings-modal.tsx:71` — o estado `commissionPercentage` é lido e nunca usado | Coluna provavelmente morta: o percentual real vive em `sale_salespersons.commission_percent`. Confirmar e remover |
| 11 | `components/dashboard/costs-view.tsx` não é usado por nenhuma tela | — | Candidato a remoção |

---

## 3. Decisões de arquitetura

### 3.1 Reinterpretar `user_id` como `tenant_id` (em vez de migrar para `org_id`)

**Decisão:** manter a coluna `user_id` nas 10 tabelas e mudar apenas o significado — passa a ser o
identificador do inquilino. As políticas trocam `auth.uid() = user_id` por `user_id = current_tenant_id()`.

**Alternativa descartada:** criar `organizations` e adicionar `org_id` em todas as tabelas.

**Justificativa:** existe um único inquilino. A alternativa exigiria alterar 10 tabelas, migrar dados,
ajustar ~12 consultas e ~10 inserts no front-end — 6 a 8 h a mais, sem benefício presente. O caminho
escolhido não fecha a porta: migrar para `org_id` depois continua possível (ver seção 12).

### 3.2 Papel e inquilino no JWT

**Decisão:** usar o *custom access token hook* do Supabase para injetar `app_role` e `tenant_id` nas
claims do token.

**Justificativa:** sem isso, o middleware faria uma consulta ao banco a cada requisição, e cada
política faria um `select` em `profiles` por linha avaliada. Com as claims no token, ambos custam zero.

**Efeito colateral a controlar:** a claim só é atualizada na renovação do token. Alterar o papel de um
usuário logado só passa a valer no próximo refresh — aceitável, mas precisa constar no guia do admin.

### 3.3 Vínculo login ↔ vendedor via tabela de junção

**Decisão:** `profile_salespersons (profile_id, salesperson_id)`, N:N.

**Alternativa descartada:** coluna `profile_id` em `sale_salespersons`, ou `user_id` direto em `sales`.

**Justificativa:**

1. **Retroatividade grátis.** As vendas já apontam para `salespersons`. Vincular o login ao registro
   existente dá acesso imediato a todo o histórico, sem backfill.
2. **A comissão já mora lá.** `sale_salespersons.commission_percent` é por venda.
3. **Nem todo vendedor terá login.** O registro `Site` é criado por trigger em toda empresa nova
   (`scripts/009_seed_site_salesperson.sql:5-6`) e nunca terá usuário. Vendedores desligados também não.
4. **O mesmo humano existe N vezes.** `salespersons` tem `company_id`; quem atua em duas empresas são
   dois registros.
5. **`sales` não muda.** Nenhuma coluna, nenhum backfill, nenhum ajuste no formulário de venda.

**Cadeia de atribuição:**

```
auth.users -> profiles -> profile_salespersons -> salespersons -> sale_salespersons -> sales
```

### 3.4 Uma view e uma RPC, com modos de segurança diferentes

Esta é a decisão mais sutil do projeto. Ver detalhamento na [seção 7.1](#71-commission_summary-precisa-ser-security-definer).

| Objeto | Modo | Motivo |
|---|---|---|
| `vendor_sales` (view) | `security_invoker = on` | Lê apenas `sales`/`sale_items`, que o vendedor pode ler. Delega o filtro ao RLS |
| `commission_summary()` (RPC) | `security definer` | Precisa agregar vendas e custos **de todos os vendedores**, que o vendedor não alcança linha a linha. Verifica o acesso internamente e devolve apenas totais |

**Por que RPC e não view:** a visão de comissões filtra por mês e ano **antes** de agregar. Uma view
agregada não aceita esse filtro, e uma view linha a linha exporia o custo de cada venda dos outros
vendedores. A RPC recebe empresa, ano e meses como parâmetros e devolve só os totais por vendedor.

**Visão idêntica para os dois perfis:** admin e vendedor chamam a mesma RPC e renderizam o mesmo
componente. A única diferença de tela é que o admin vê, acima dele, os cartões de visão geral.

### 3.5 Front-end declarativo

```
SessionProvider (role, tenant_id, salesperson_ids, permissions)
        |
        +-- usePermissions()
        +-- <Can permission="sales.view_costs">
        +-- nav-registry.ts — cada aba/rota declara a permissão que exige
```

Adicionar um papel novo passa a custar uma linha no registro e uma linha em `role_permissions`.

---

## 4. Modelo de dados alvo

### 4.1 DDL das tabelas novas

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  role text not null check (role in ('admin','vendedor')),
  full_name text,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_tenant_role on public.profiles(tenant_id, role);

create table public.profile_salespersons (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  salesperson_id uuid not null references public.salespersons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, salesperson_id),
  -- um registro de vendedor não pode pertencer a dois logins
  unique (salesperson_id)
);
create index idx_profile_salespersons_profile on public.profile_salespersons(profile_id);

create table public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);
```

### 4.2 Funções auxiliares

```sql
-- lê a claim do JWT; cai para consulta em profiles se a claim ainda não existir
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id','')::uuid,
    (select p.tenant_id from public.profiles p where p.id = auth.uid())
  )
$$;

-- não se chama current_role: é palavra reservada do SQL, e sem o schema resolveria para a
-- função embutida do Postgres (que devolve o papel do banco, ex. 'authenticated')
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'app_role',''),
    (select p.role from public.profiles p where p.id = auth.uid())
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.my_salesperson_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ps.salesperson_id
  from public.profile_salespersons ps
  where ps.profile_id = auth.uid()
$$;
```

> Todas `stable security definer` com `search_path` fixo — obrigatório para evitar recursão de RLS e
> sequestro de `search_path`.

### 4.3 Padrão das políticas

```sql
-- leitura de vendas: admin vê o inquilino inteiro; vendedor vê apenas onde está vinculado
create policy "sales_select" on public.sales for select using (
  user_id = public.current_tenant_id()
  and (
    public.is_admin()
    or exists (
      select 1 from public.sale_salespersons ss
      where ss.sale_id = sales.id
        and ss.salesperson_id in (select public.my_salesperson_ids())
    )
  )
);

-- escrita: exclusiva do admin
create policy "sales_write" on public.sales for all using (
  user_id = public.current_tenant_id() and public.is_admin()
) with check (
  user_id = public.current_tenant_id() and public.is_admin()
);
```

Tabelas filhas (`sale_items`, `sale_costs`, `sale_salespersons`) derivam do pai:

```sql
create policy "sale_items_select" on public.sale_items for select using (
  exists (select 1 from public.sales s where s.id = sale_items.sale_id)
);
-- o RLS de sales já filtra o exists acima
```

**Exceção em `sale_salespersons` (revisão de 28/09/2026):** a leitura do vendedor **não** deriva da
venda-mãe. Numa venda compartilhada, isso exporia o `commission_percent` do colega. O vendedor lê
só as próprias linhas (`salesperson_id in (select public.my_salesperson_ids())`); o admin lê todas
do inquilino.

`sale_costs` é a exceção: **vendedor nunca lê**, mesmo das próprias vendas. *(Mudou em 08/10/2026, issue #13, 3.9: o vendedor lê os custos das vendas em que consta, só leitura, para o detalhe da venda.)*

```sql
create policy "sale_costs_select" on public.sale_costs for select using (
  user_id = public.current_tenant_id() and public.is_admin()
);
```

### 4.4 View de vendas do vendedor e RPC de comissões

```sql
-- delega o filtro ao RLS de sales
create view public.vendor_sales with (security_invoker = on) as
select s.id, s.company_id, s.order_number, s.product_name, s.customer_name,
       s.sale_date, s.quantity, s.unit_price, s.total_price,
       s.status, s.payment_status, s.entry_value, s.notes, s.created_at
from public.sales s;
-- nenhuma coluna de custo, margem ou líquido

```

```sql
-- Resumo de comissões por vendedor. IDÊNTICO para admin e vendedor.
-- security definer: agrega vendas e custos de todos os vendedores, que o vendedor
-- não alcança linha a linha. Por isso verifica o acesso aqui dentro e devolve só totais.
create or replace function public.commission_summary(
  p_company_id uuid,
  p_year int,
  p_months int[] default null   -- 1..12 (o DashboardFilters usa 0..11: converter no front); null = ano inteiro
)
returns table (
  salesperson_id   uuid,
  salesperson_name text,
  sales_count      bigint,
  total_sales      numeric,
  total_costs      numeric,
  net_profit       numeric,
  total_commission numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- guarda: admin do inquilino, ou vendedor vinculado a esta empresa
  if not exists (
    select 1 from companies c
    where c.id = p_company_id
      and c.user_id = current_tenant_id()
      and (
        is_admin()
        or exists (
          select 1 from salespersons sp
          where sp.company_id = c.id
            and sp.id in (select my_salesperson_ids())
        )
      )
  ) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  return query
  with sale_totals as (
    select s.id, s.total_price,
           coalesce((select sum(sc.amount) from sale_costs sc where sc.sale_id = s.id), 0) as costs
    from sales s
    where s.company_id = p_company_id
      and s.status = 'concluída'
      and extract(year from s.sale_date)::int = p_year
      and (p_months is null or extract(month from s.sale_date)::int = any(p_months))
  )
  select sp.id,
         sp.name,
         count(st.id),
         coalesce(sum(st.total_price), 0),
         coalesce(sum(st.costs), 0),
         coalesce(sum(st.total_price - st.costs), 0),
         coalesce(round(sum((st.total_price - st.costs) * ss.commission_percent / 100), 2), 0)
  from salespersons sp
  left join sale_salespersons ss on ss.salesperson_id = sp.id
  left join sale_totals st on st.id = ss.sale_id
  where sp.company_id = p_company_id
    and sp.is_active
  group by sp.id, sp.name
  order by sp.name;
end;
$$;

revoke execute on function public.commission_summary(uuid, int, int[]) from public, anon;
grant  execute on function public.commission_summary(uuid, int, int[]) to authenticated;
```

> **Implementação (Fase 6, `scripts/016_vendor_views.sql`):** 8 colunas (+ `is_active`), sem
> arredondamento (N13), vendedor inativo com vendas incluído (N12) e `p_months` nulo = sem filtro de
> data (como o Dashboard sem mês marcado) — os padrões da #13 até ela ser respondida. Conferida
> contra o oráculo da Fase 1 pela emulação do mock (`lib/calc/commission-summary-oracle.test.ts`).

> A RPC devolve **uma linha por vendedor**, nunca uma linha por venda. É isso que permite mostrar os
> custos agregados de todos sem abrir o detalhe das vendas dos demais.
> O cálculo replica o comportamento atual de `dashboard-view.tsx:177-213` — inclusive o valor cheio
> em venda compartilhada, até Q2 ser decidida. Admin e vendedor passam a usar a mesma fonte,
> eliminando os achados 8 e 9.
> Filtrar a data no banco também elimina a conversão por `toISOString()` que o front faz hoje
> (`dashboard-view.tsx:106-115`), sujeita a erro de fuso horário na virada do mês.

---

## 5. Ordem de execução e dependências

```
[1.1 schema real] ──> [1.2 brechas RLS] ──> [1.3 identidade] ──┬──> [1.4 políticas] ──> [1.5 views] ──> [1.6 backfill]
                                                               │                            │
                                                               v                            v
                                                         [2.x front-end]              [4.5 comissões]
                                                               │
                                                               v
                                                         [3.x usuários] ──> [4.x área do vendedor] ──> [5.x testes]
```

**Regras de ordem:**

- **1.1 antes de tudo.** Não se reescreve política de objeto não mapeado.
- **1.3 antes de 1.4.** As políticas dependem das funções auxiliares.
- **1.4 antes de 1.5.** `vendor_sales` delega o filtro ao RLS de `sales`.
- **2.x pode começar** assim que 1.3 estiver no ar, mesmo com 1.4 em andamento.
- **3.x depende de 1.3** (tabelas de vínculo) e **2.1** (contexto de sessão).
- **4.5 depende de 1.5** (`commission_summary()`).
- **5.x por último**, e não é opcional.

**Ponto de não retorno:** ao aplicar 1.4 em produção, o sistema passa a depender de `profiles` estar
preenchido. Por isso 1.6 (backfill do admin) precisa ir junto, na mesma transação ou imediatamente após.

---

## 6. Plano de execução

### ETAPA 1 — Fundação de segurança no banco — 12 h

Nenhuma tela nova. É a base sem a qual o restante não é seguro.

#### 1.1 Levantamento e reconciliação do schema real — 1 h

- [ ] `pg_dump --schema-only` do projeto de produção
- [ ] Diff contra `scripts/*.sql`; documentar toda divergência
- [ ] Migration retroativa cobrindo o que só existe no banco: `sales.order_number`, `sales.payment_status`, `sales.entry_value`, `fixed_costs.qtdmonths`, tabela `sale_salespersons`
- [ ] Versionar `scripts/views/sales_with_salespersons.sql`
- [ ] Inventário das políticas atuais: `select * from pg_policies where schemaname = 'public'`
- [ ] Salvar o estado inicial como linha de base do rollback

#### 1.2 Fechar as brechas existentes — 1,5 h

> **Fora do escopo da release 2 (decisão de 28/09/2026):** registrado na issue #9.
> Continua sendo pré-requisito da área do vendedor (Fase 6).

- [ ] `alter table public.sale_items enable row level security` + 4 políticas
- [ ] Auditar `sale_salespersons`; habilitar RLS + 4 políticas
- [ ] Recriar `sales_with_details` com `with (security_invoker = on)`
- [ ] Recriar `sales_with_salespersons` com `with (security_invoker = on)`
- [ ] Revisar `grant`s: revogar `anon` em todas as tabelas, manter `authenticated`
- [ ] **Regressão obrigatória:** confirmar que o admin continua enxergando tudo após ativar o invoker

#### 1.3 Modelo de identidade e papéis — 2,5 h

- [ ] Tabelas `profiles`, `profile_salespersons`, `role_permissions` (DDL da seção 4.1)
- [ ] Restrição `unique (salesperson_id)` impedindo o mesmo vendedor em dois logins
- [ ] Carga inicial do catálogo de permissões
- [ ] Trigger `on_auth_user_created` criando o perfil
- [ ] Funções auxiliares da seção 4.2
- [ ] Custom access token hook injetando `app_role` e `tenant_id`
- [ ] Habilitar o hook no painel (Auth > Hooks)
- [ ] RLS de `profiles` — **atenção à recursão, ver seção 7.2**
- [ ] Desabilitar auto-cadastro nas configurações de autenticação

#### 1.4 Reescrita das políticas — 4 h

> **Item de maior risco do projeto.** ~40 políticas, 10 tabelas, 4 operações cada.

- [ ] `companies` — admin: inquilino; vendedor: apenas onde atua
- [ ] `sales` — padrão da seção 4.3
- [ ] `sale_items` — deriva de `sales`
- [ ] `sale_costs` — **admin apenas**
- [ ] `sale_salespersons` — leitura derivada de `sales`; escrita só admin
- [ ] `salespersons` — vendedor lê apenas os próprios registros
- [ ] `inventory` — vendedor lê todas as colunas (inclusive `unit_cost` e `total_value`) das empresas em que atua; `INSERT`/`UPDATE`/`DELETE` apenas admin
- [ ] `costs`, `fixed_costs`, `contracts` — **negados ao vendedor**
- [ ] Índices: `sale_salespersons(salesperson_id, sale_id)`, `profile_salespersons(profile_id)`, `profiles(tenant_id, role)`
- [ ] Validar cada política simulando o JWT dos dois papéis (seção 8.3)
- [ ] `comment on policy` em cada uma, explicando a intenção

#### 1.5 View de vendas e RPC de comissões — 2 h

- [ ] `vendor_sales` com `security_invoker = on` (DDL da seção 4.4)
- [ ] `commission_summary(p_company_id, p_year, p_months)` como `security definer`, com guarda de acesso interna
- [ ] Garantir que a RPC devolve **apenas agregados por vendedor** — nenhuma linha por venda
- [ ] Implementar a regra de venda compartilhada definida em Q2
- [ ] Conferir os valores da RPC contra o cálculo atual de `dashboard-view.tsx:177-213`, com o retrato salvo antes da migração
- [ ] `revoke` de `public`/`anon` e `grant execute` para `authenticated`

#### 1.6 Backfill e rollback — 1 h

- [ ] Migration criando o perfil do admin atual (`role = 'admin'`, `tenant_id` = próprio id)
- [ ] Preencher `tenant_id` dos registros existentes
- [ ] Script de rollback para cada migration (seção 9)
- [ ] Checklist de execução em produção: ordem, janela, verificações

---

### ETAPA 2 — Camada de permissão na aplicação — 5,5 h

#### 2.1 Sessão e permissões no React — 2 h

- [ ] `lib/auth/permissions.ts` — catálogo espelhando `role_permissions`
- [ ] `lib/auth/session-provider.tsx` — papel, inquilino, vendedores vinculados, permissões
- [ ] `hooks/use-permissions.ts`
- [ ] `components/can.tsx`
- [ ] `lib/auth/nav-registry.ts`
- [ ] Refatorar `dashboard-layout.tsx:58-78` e `company-dashboard.tsx:33-58` para montar as abas pelo registro, no lugar das listas fixas

#### 2.2 Middleware e rotas — 1 h

- [ ] Ler papel e inquilino do JWT, sem consulta ao banco
- [ ] Bloquear rotas de admin para o vendedor
- [ ] `app/403/page.tsx`
- [ ] Redirecionamento pós-login por papel em `app/auth/login/page.tsx:36`
- [ ] Remover `/auth/sign-up` de `PUBLIC_ROUTES` (`lib/supabase/middleware.ts:5-11`)

#### 2.3 Troca de senha obrigatória — 1,5 h

- [ ] `app/auth/trocar-senha/page.tsx`
- [ ] Guarda no middleware enquanto `must_change_password` estiver ativo
- [ ] Limpar a flag após a troca
- [ ] Regras mínimas de senha, mensagens em PT-BR

#### 2.4 Bootstrap do dashboard — 1 h

- [ ] Remover a auto-criação das três empresas em `app/dashboard/page.tsx:18-30`
- [ ] Carregar empresas conforme o papel
- [ ] Estado vazio para vendedor sem vínculo

---

### ETAPA 3 — Gestão de usuários — 8 h

#### 3.1 Primeira camada de servidor — 2,5 h

- [ ] `SUPABASE_SERVICE_ROLE_KEY` em `.env`, `.env.example` e Vercel
- [ ] `lib/supabase/admin.ts` — cliente com chave de serviço, **nunca importado por Client Component**
- [ ] `app/api/users/route.ts` — POST (criar), GET (listar)
- [ ] `app/api/users/[id]/route.ts` — PATCH (editar, ativar/desativar), POST (resetar senha)
- [ ] Verificação de admin **no servidor**, em toda rota
- [ ] Validação com zod
- [ ] Tratamento de e-mail duplicado e erros da Admin API
- [ ] Limite básico de requisições nas rotas sensíveis

#### 3.2 Interface de usuários — 4 h

- [ ] Seção "Usuários", condicionada à permissão
- [ ] Listagem: nome, e-mail, papel, empresas, situação, último acesso
- [ ] Formulário de criação: nome, e-mail, senha temporária, papel, vínculos
- [ ] Edição
- [ ] Ativar/desativar — desativado não entra
- [ ] Resetar senha (nova temporária + reativa a flag)
- [ ] Confirmações destrutivas, toasts, estados de carregamento
- [ ] Textos e validações em PT-BR

#### 3.3 Vínculo login ↔ vendedor — 1,5 h

- [ ] Seleção múltipla de empresa + registro em `salespersons`
- [ ] Criar o registro de vendedor na hora, junto com o usuário
- [ ] Vincular a registro existente, aproveitando o histórico
- [ ] Bloquear vínculo duplicado (a restrição do banco cobre; a UI precisa avisar antes)
- [ ] Alertar quando o registro escolhido não tiver nenhuma venda
- [ ] Indicar em `settings-modal.tsx` quais vendedores já possuem login

---

### ETAPA 4 — Área do vendedor — 12 h

#### 4.1 Extração do motor de vendas — 4 h

> **Segundo item de maior risco.** `sales-view.tsx` tem 910 linhas e concentra filtros, paginação,
> exportação e estatísticas.

- [ ] `hooks/use-sales-query.ts` — filtros, paginação, ordenação, exportação
- [ ] Parametrizar a origem (`sales_with_details` / `vendor_sales`)
- [ ] Reescrever `sales-view.tsx` sobre o hook (~910 → ~400 linhas)
- [ ] Regressão completa da tela do admin, incluindo exportação CSV

#### 4.2 Tabela configurável — 1 h

- [ ] Propriedade de colunas visíveis em `sales-table.tsx:340-352`
- [ ] Propriedade de ações disponíveis
- [ ] Ocultar "Custo Total" e o total líquido para vendedor
- [ ] Remover a coluna de ações no modo leitura

#### 4.3 Layout do vendedor — 2 h

- [ ] `vendor-layout.tsx` — abas Vendas / Comissões / Estoque
- [ ] Seletor de empresa para vendedor multi-empresa
- [ ] Cabeçalho, sair, acesso à troca de senha
- [ ] Estado vazio sem vínculo

#### 4.4 Indicadores da aba Vendas — 1,5 h

- [ ] Cartões da aba Vendas do vendedor, sem custo nem lucro: nº de vendas, valor vendido, comissão do período
- [ ] Reaproveitar `DashboardFilters`

#### 4.5 Comissões por vendedor — componente compartilhado — 2,5 h

A visão de comissões é **a mesma para os dois perfis**. Em vez de criar um relatório novo para o
vendedor, a seção existente é extraída e reaproveitada.

- [ ] Extrair a seção "Comissões por Vendedor" (`dashboard-view.tsx:347`) para `components/dashboard/commissions-by-salesperson.tsx`
- [ ] O componente chama `commission_summary()` e renderiza os cartões por vendedor: total de vendas, custos das vendas, lucro líquido e comissão
- [ ] Filtro de mês e ano com `DashboardFilters`, convertendo os meses de 0..11 para 1..12
- [ ] Remover de `dashboard-view.tsx` o cálculo de comissão no navegador (`:177-213`) e a busca de `sale_costs` por lote (`:155-167`)
- [ ] Admin: aba Dashboard = cartões de visão geral (`dashboard-view.tsx:242`) + componente compartilhado
- [ ] Vendedor: aba Comissões = **apenas** o componente compartilhado
- [ ] O cartão "Comissões" da visão geral do admin passa a somar o retorno da RPC
- [ ] Conferir visualmente que admin e vendedor enxergam exatamente os mesmos números

#### 4.6 Estoque somente leitura — 1 h

Visão geral do estoque, com custo, sem nenhuma ação de escrita.

- [ ] Reaproveitar `InventoryView` e `InventoryTable` com uma propriedade `readOnly`
- [ ] Manter todas as colunas: Produto, Localização, Quantidade, **Custo Unit.**, **Valor Total**, Última Atualização
- [ ] Manter os cartões de resumo (Valor Total, Total de Produtos, Quantidade Total)
- [ ] Ocultar o botão "Novo Item" (`inventory-view.tsx:143`)
- [ ] Ocultar a coluna "Ações" (`inventory-table.tsx:109`) e os botões de editar e excluir (`inventory-table.tsx:138`, `:149`)
- [ ] Não montar `InventoryForm` no modo leitura
- [ ] Tornar `onEdit` e `onDelete` opcionais em `InventoryTable` (hoje obrigatórios, `inventory-table.tsx:20-21`)
- [ ] Filtrar pelas empresas em que o vendedor atua (o RLS garante; a UI usa o seletor de empresa de 4.3)

> Esconder os botões é UX. A proteção real é a política de `inventory`: escrita exclusiva do admin (1.4)
> e validada pelos testes negativos de 8.2.

---

### ETAPA 5 — Qualidade e entrega — 5,5 h

#### 5.1 Matriz de testes — 2,5 h

- [ ] Ambiente de homologação com dados de teste
- [ ] Executar a matriz da seção 8
- [ ] Registrar os resultados

#### 5.2 Performance — 1,5 h

- [ ] `explain analyze` das consultas paginadas sob RLS
- [ ] Ajuste de índices
- [ ] Medir o custo do hook de geração do token

#### 5.3 Implantação e documentação — 1,5 h

- [ ] Roteiro de execução das migrations em produção
- [ ] Variáveis na Vercel
- [ ] Atualizar `CLAUDE.md` com o modelo de papéis
- [ ] Guia do admin: criar, vincular e desativar vendedor
- [ ] Janela de implantação e plano de retorno

---

## 7. Armadilhas conhecidas

### 7.1 `commission_summary` precisa ser `security definer`

A comissão é `(total_price − custos) × percentual`, e a visão mostra **todos os vendedores**. O cálculo
exige ler as vendas dos outros vendedores e a tabela `sale_costs` — e, pelo RLS, o vendedor não
alcança nenhuma das duas linha a linha.

Se a função rodasse com as permissões de quem chama (`security invoker`), o vendedor receberia:

- os cartões dos outros vendedores **zerados**, porque o RLS de `sales` esconde as vendas deles; e
- a própria comissão **inflada**, porque o `sale_costs` voltaria vazio, os custos virariam 0 e a
  comissão seria calculada sobre o valor bruto.

Tudo isso **silenciosamente, sem erro algum** — e o admin, que lê tudo, veria números diferentes na
mesma tela, quebrando a regra de "visão idêntica".

Por isso a função é `security definer` e carrega dentro dela a própria guarda de acesso (inquilino +
admin ou vendedor vinculado à empresa).

> Consequência: essa função **ignora RLS por construção**. A guarda do início e o formato do retorno
> (só agregados, nunca linhas por venda) são a única proteção. Qualquer alteração nela precisa ser
> revisada com o mesmo cuidado de uma política — em especial, **nunca acrescentar colunas por venda
> no retorno**.

### 7.2 Recursão de RLS em `profiles`

Se a política de `profiles` chamar uma função que consulta `profiles`, o Postgres entra em recursão
infinita e a consulta falha com erro genérico.

**Mitigação:** as políticas de `profiles` usam `auth.uid()` direto e as claims do JWT, nunca
`current_tenant_id()`. As funções auxiliares são `security definer`, o que já as faz ignorar o RLS da
tabela que consultam — mas a política da própria `profiles` precisa ser escrita sem elas.

### 7.3 A claim do JWT só atualiza no refresh

Alterar o papel ou o vínculo de um usuário logado só passa a valer no próximo refresh do token.

**Mitigação:** as funções auxiliares caem para consulta em `profiles` quando a claim está ausente;
para mudanças de papel, o caminho seguro é desativar o usuário (o que invalida o acesso na próxima
verificação) e orientar novo login. Registrar no guia do admin.

### 7.4 `security_invoker` muda o resultado das views existentes

Ativar o invoker em `sales_with_details` faz o RLS passar a valer ali. Se qualquer política ficar mais
restritiva do que o esperado, **a tela do admin perde linhas sem erro**.

**Mitigação:** regressão imediatamente após 1.2, antes de seguir para 1.4.

### 7.5 O filtro de vendedor faz duas consultas

`sales-view.tsx:113-122` busca os `sale_id` de um vendedor e depois usa `.in("id", saleIds)`. Com
muitas vendas, isso estoura o tamanho da URL.

**Mitigação:** ao extrair o motor (4.1), trocar por filtro na própria view, agora que o vínculo existe
no banco.

### 7.6 Políticas erradas não geram erro

O modo de falha do RLS é **silencioso**: a linha simplesmente não aparece. Nenhum teste de "não
quebrou" detecta isso. Só a matriz da seção 8, comparando contagens esperadas, pega.

---

## 8. Matriz de testes

### 8.1 Por tela e papel

| Tela | Admin | Vendedor |
|---|---|---|
| Login | Entra e cai no dashboard | Entra e cai na área do vendedor |
| Primeiro acesso | — | É forçado à troca de senha e não escapa por URL |
| Dashboard — cartões de visão geral | Vê receita, receita líquida, comissões, custos de vendas, custos gerais e lucro | **Não vê** |
| Vendas — listagem | Vê todas | Vê apenas as próprias |
| Vendas — colunas | Vê custo e líquido | **Não vê** custo nem líquido |
| Vendas — ações | Edita, exclui, confirma pagamento | **Sem coluna de ações** |
| Vendas — filtros | Todos funcionam | Todos funcionam, no subconjunto dele |
| Comissões por vendedor | Todos os vendedores, com total vendido, custos, lucro líquido e comissão | **Idêntico ao admin** — mesmos cartões, mesmos números, mesmos filtros |
| Estoque | Consulta e edita | Vê todas as colunas, **inclusive custo**; sem "Novo Item" e sem coluna de ações |
| Custos fixos | Acessa | **403** |
| Contratos | Acessa | **403** |
| Configurações | Acessa | **403** |
| Usuários | Acessa | **403** |

### 8.2 Testes negativos (fora da interface)

Com o token do vendedor, via chamada direta à API:

- [ ] `GET /rest/v1/sales` — retorna apenas as vendas dele
- [ ] `GET /rest/v1/sale_costs` — retorna vazio
- [ ] `GET /rest/v1/contracts` — retorna vazio
- [ ] `GET /rest/v1/fixed_costs` — retorna vazio
- [ ] `GET /rest/v1/sales_with_details` — retorna vazio ou apenas as dele, **nunca com custo**
- [ ] `POST /rest/v1/rpc/commission_summary` com empresa em que atua — retorna uma linha por vendedor, com os mesmos valores que o admin recebe
- [ ] `POST /rest/v1/rpc/commission_summary` com empresa em que **não** atua — erro `42501`
- [ ] Conferir que nenhuma resposta da RPC contém id de venda, cliente ou produto
- [ ] `POST /rest/v1/sales` — negado
- [ ] `PATCH /rest/v1/sales?id=eq.<venda de outro>` — negado
- [ ] `GET /rest/v1/inventory` — retorna o estoque das empresas em que atua, **com** `unit_cost` e `total_value`
- [ ] `GET /rest/v1/inventory?company_id=eq.<empresa em que não atua>` — retorna vazio
- [ ] `POST /rest/v1/inventory` — negado
- [ ] `PATCH /rest/v1/inventory?id=eq.<item>` — negado
- [ ] `DELETE /rest/v1/inventory?id=eq.<item>` — negado
- [ ] `POST /api/users` — negado (verificação de admin no servidor)

### 8.3 Validação de política isolada

```sql
-- simula o vendedor e confere a contagem esperada
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-do-vendedor>","app_metadata":{"app_role":"vendedor","tenant_id":"<uuid>"}}';
select count(*) from sales;          -- deve bater com as vendas vinculadas
select count(*) from sale_costs;     -- deve ser 0
select count(*) from contracts;      -- deve ser 0
reset role;
```

### 8.4 Cenários de vínculo

- [ ] Vendedor com um registro em uma empresa
- [ ] Vendedor com registros em duas empresas — vê as duas abas e o seletor funciona
- [ ] Vendedor vinculado a registro sem nenhuma venda — estado vazio, sem erro
- [ ] Tentativa de vincular o mesmo registro a dois logins — bloqueado com mensagem clara
- [ ] Venda compartilhada entre dois vendedores — cada um vê a venda, com a comissão dele
- [ ] Registro `Site` continua funcionando sem login associado
- [ ] Usuário desativado não consegue entrar

### 8.5 Regressão do admin

- [ ] Todas as telas atuais carregam com os mesmos números de antes da migração
- [ ] Exportação CSV com o mesmo conteúdo
- [ ] Criar, editar e excluir venda
- [ ] Confirmar pagamento e alternar status
- [ ] Comissões por vendedor batem com o valor anterior à migração

> Antes de iniciar a Etapa 1, **salvar um retrato dos números atuais** (receita, custos, lucro e
> comissões por vendedor, por período) para comparar depois.

---

## 9. Plano de retorno

Cada migration tem seu par de reversão. Ordem inversa da aplicação.

| Migration | Reversão |
|---|---|
| `018_backfill_admin.sql` | Remover só os perfis criados pelo backfill (`id = tenant_id`, `role = 'admin'`, dono de empresas), nunca a tabela inteira |
| `017_indexes.sql` | `drop index` |
| `016_vendor_views.sql` | `drop view vendor_sales` + `drop function commission_summary(uuid, int, int[])` |
| `015_rewrite_policies.sql` | Restaurar as políticas da linha de base salva em 1.1 |
| `014_auth_helpers.sql` | `drop function`; desabilitar o hook no painel |
| `013_create_profiles.sql` | `drop table` das três tabelas |
| `012_fix_missing_rls.sql` | Manter — é correção de brecha, não deve ser revertida |
| `011_reconcile_schema.sql` | Nenhuma alteração destrutiva; nada a reverter |

**Gatilho de retorno:** qualquer divergência nos números do admin após 1.4 que não seja resolvida em
até 30 minutos de investigação.

**Pré-requisito:** backup do banco imediatamente antes da janela, e o dump da linha de base de 1.1.

---

## 10. Critérios de aceite

| Etapa | Pronto quando |
|---|---|
| 1 | O admin enxerga exatamente os mesmos números de antes, e `select * from pg_policies` cobre as 10 tabelas com políticas comentadas |
| 2 | Abas e rotas vêm do registro; nenhuma lista fixa restou; o vendedor de teste é barrado nas rotas de admin |
| 3 | O admin cria um vendedor pela tela, vincula a um registro existente, e o novo usuário entra e é forçado a trocar a senha |
| 4 | O vendedor vê apenas as vendas dele, com os mesmos filtros do admin e sem coluna de custo; a seção de comissões mostra **exatamente os mesmos números** para admin e vendedor, e esses números batem com o retrato salvo antes da migração |
| 5 | A matriz da seção 8 está executada e registrada, sem pendências |

---

## 11. Questões bloqueantes

| # | Questão | Bloqueia | Padrão se não houver resposta |
|---|---|---|---|
| ~~Q1~~ | ~~Estoque do vendedor mostra `unit_cost` e `total_value`?~~ | — | **Resolvida (13/09/2026):** mostra, somente leitura. Sem `vendor_inventory`, sem hora adicional |
| Q2 | Venda compartilhada conta integralmente para os dois? | **1.5** | Replicar o comportamento atual e sinalizar a divergência no relatório |
| Q3 | Existe segundo projeto Supabase para homologação? | **1.4** | Sem isso, não avançar. +1 h para criar |
| Q4 | Vendedor exporta CSV? | 4.1 | Não exportar; habilitar depois custa 0,5 h |
| Q5 | Quantos vendedores no primeiro ano? | 5.2 | Dimensionar para até 20 |
| Q6 | Algum vendedor atual fica sem login? | 3.3 | `Site` fica; confirmar os demais |

> Q2 e Q3 são bloqueantes de verdade. Q4, Q5 e Q6 têm padrão seguro e não impedem o início.
> Na proposta comercial as questões foram renumeradas: Q2 → item 1, Q3 → 2, Q4 → 3, Q5 → 4, Q6 → 5.

---

## 12. Backlog futuro

Fora do escopo atual. Registrado para não se perder.

| Item | Esforço | Observação |
|---|---|---|
| Convite por e-mail + recuperação de senha | 2 h | Exige SMTP próprio (Resend/SendGrid); o do Supabase não serve para produção |
| Registro de auditoria | 2 h | Tabela de log + triggers nas tabelas sensíveis |
| Vendedor lança as próprias vendas | 3 h | Políticas de escrita com `with check` + `sales-form.tsx` em modo restrito |
| Papel "gerente" | 1,5 h | Barato **depois** da Etapa 1: uma linha no registro + uma em `role_permissions` |
| Migrar para `organizations` + `org_id` | 6 h | Só se o sistema for atender um segundo cliente |
| Responsividade da área do vendedor | 3 h | Uso em celular |
| Remover `costs-view.tsx` e a coluna `commission_percentage` | 0,5 h | Código morto (achados 10 e 11) |

---

## Anexo A — Inventário de arquivos

### Novos (16)

| Arquivo | Finalidade |
|---|---|
| `lib/auth/permissions.ts` | Catálogo de permissões |
| `lib/auth/session-provider.tsx` | Contexto de sessão |
| `lib/auth/nav-registry.ts` | Abas e rotas por permissão |
| `hooks/use-permissions.ts` | Consulta de permissões |
| `components/can.tsx` | Guarda declarativa |
| `hooks/use-sales-query.ts` | Motor de filtros, paginação e exportação |
| `lib/supabase/admin.ts` | Cliente com chave de serviço |
| `app/api/users/route.ts` | Criar e listar usuários |
| `app/api/users/[id]/route.ts` | Editar, desativar, resetar senha |
| `app/auth/trocar-senha/page.tsx` | Troca obrigatória |
| `app/403/page.tsx` | Acesso negado |
| `components/dashboard/users/users-view.tsx` | Listagem |
| `components/dashboard/users/user-form.tsx` | Cadastro, edição, vínculo |
| `components/dashboard/vendor/vendor-layout.tsx` | Layout do vendedor |
| `components/dashboard/vendor/vendor-sales-view.tsx` | Vendas do vendedor |
| `components/dashboard/commissions-by-salesperson.tsx` | Comissões por vendedor — **compartilhado** entre admin e vendedor |

### Modificados

| Arquivo | Linhas | Mudança |
|---|---|---|
| `components/dashboard/sales-view.tsx` | 910 | Extração do motor de filtros e paginação |
| `components/dashboard/sales-table.tsx` | 559 | Colunas e ações por papel |
| `components/dashboard/dashboard-view.tsx` | 415 | Mantém só os cartões de visão geral; a seção de comissões vira componente compartilhado e o cálculo migra para a RPC |
| `components/dashboard/dashboard-layout.tsx` | 84 | Abas pelo registro |
| `components/dashboard/company-dashboard.tsx` | 60 | Abas pelo registro |
| `components/dashboard/settings-modal.tsx` | 244 | Indicar vendedores com login |
| `components/dashboard/inventory-view.tsx` | 169 | Modo leitura |
| `components/dashboard/inventory-table.tsx` | 165 | Ações condicionais |
| `app/dashboard/page.tsx` | 40 | Remover auto-criação de empresas |
| `middleware.ts` / `lib/supabase/middleware.ts` | 44 | Proteção por papel |
| `app/auth/login/page.tsx` | 86 | Redirecionamento por papel |
| `lib/types.ts` | 122 | Tipos de perfil, papel, permissão |
| `.env` / `.env.example` | — | Chave de serviço |
| `CLAUDE.md` | — | Documentar o modelo de papéis |

### Migrations

| Arquivo | Conteúdo | Etapa |
|---|---|---|
| `011_reconcile_schema.sql` | Reconciliação do schema real | 1.1 |
| `012_fix_missing_rls.sql` | RLS de `sale_items` e `sale_salespersons` | 1.2 |
| `013_create_profiles.sql` | Perfis, vínculos, permissões | 1.3 |
| `014_auth_helpers.sql` | Funções auxiliares e hook de token | 1.3 |
| `015_rewrite_policies.sql` | Reescrita das ~40 políticas | 1.4 |
| `016_vendor_views.sql` | View `vendor_sales` e RPC `commission_summary()` | 1.5 |
| `017_indexes.sql` | Índices de apoio | 1.4 |
| `018_backfill_admin.sql` | Perfil do admin atual | 1.6 |
| `views/sales_with_details.sql` | Recriada com `security_invoker` | 1.2 |
| `views/sales_with_salespersons.sql` | Versionada + `security_invoker` | 1.2 |

---

## Anexo B — Mapa de permissões

| Recurso | Admin | Vendedor |
|---|---|---|
| `companies` | Todas do inquilino | Apenas onde atua |
| `sales` — leitura | Todas | Onde consta em `sale_salespersons` |
| `sales` — escrita | Sim | Não |
| `sale_items` | Sim | Apenas das próprias vendas |
| `sale_costs` | Sim | **Não** |
| `sale_salespersons` — leitura | Sim | Apenas das próprias vendas |
| `salespersons` | Todos | Apenas os próprios registros |
| `inventory` — leitura | Sim | Sim, das empresas em que atua, **incluindo `unit_cost` e `total_value`** |
| `inventory` — escrita | Sim | **Não** |
| `costs` | Sim | **Negado** |
| `fixed_costs` | Sim | **Negado** |
| `contracts` | Sim | **Negado** |
| `profiles` | Do inquilino | Apenas o próprio |
| `commission_summary()` (RPC) | Todas as empresas do inquilino | Empresas em que atua — **todos os vendedores**, com custos, apenas agregado |
| Cartões de visão geral do Dashboard | Sim | **Não** |

---

## Anexo C — Navegação por papel

**Admin:**

```
Clock Society | The Secret | Morfeus | Contratos | Usuários (novo)
    +-- Dashboard | Vendas | Estoque | Custos
```

**Vendedor:**

```
[Empresas em que atua]
    +-- Vendas | Comissões | Estoque
```
