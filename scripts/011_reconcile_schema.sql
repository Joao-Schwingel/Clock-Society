-- 011 — Reconciliação do schema (planejamento 1.1; item 2 da revisão de 28/09/2026).
-- Tudo o que existe em produção (backups/schema.sql, dump de 28/09/2026) e que nenhum script
-- anterior criava. IDEMPOTENTE: em produção não altera nada (tudo já existe). Num banco novo,
-- completa os scripts para que o resultado seja igual a produção.
--
-- Banco novo: 001–009, pular a 010 (falha sem qtdmonths; esta migration faz o que ela faz),
-- esta 011, e depois scripts/views/*.sql. Não usar scripts/alteracoes/10_01.sql (cria um gatilho
-- que não existe em produção).
--
-- Fora de propósito: create_sale() e salesperson_summary_by_months() existem em produção, mas o
-- app não as usa e a 012 tira o acesso a elas; não são recriadas aqui.
-- Rollback: nada a reverter em produção (scripts/rollback/011_reconcile_schema.down.sql).

begin;

-- sales: colunas criadas à mão no painel (achado 4)
alter table public.sales add column if not exists order_number integer;
alter table public.sales add column if not exists entry_value numeric(12,2) not null default 0;
alter table public.sales add column if not exists payment_status text not null default 'pendente';
do $$
begin
  -- Em produção a coluna já é NOT NULL; num banco novo, só vira NOT NULL se não houver nulos.
  if not exists (select 1 from public.sales where order_number is null) then
    alter table public.sales alter column order_number set not null;
  end if;
end $$;

-- fixed_costs: qtdmonths (achado 4) e o que a 010 faz (end_date + gatilho)
alter table public.fixed_costs add column if not exists qtdmonths integer not null default 1;
alter table public.fixed_costs add column if not exists end_date date;

do $$
begin
  if to_regprocedure('public.fixed_costs_set_end_date()') is null then
    create function public.fixed_costs_set_end_date()
    returns trigger language plpgsql as $f$
    begin
      new.end_date := new.start_date + (new.qtdmonths || ' months')::interval;
      return new;
    end;
    $f$;
  end if;

  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_fixedcosts_set_end_date'
                   and tgrelid = 'public.fixed_costs'::regclass) then
    create trigger trg_fixedcosts_set_end_date
      before insert or update of start_date, qtdmonths on public.fixed_costs
      for each row execute function public.fixed_costs_set_end_date();
  end if;
end $$;

-- sale_items: como em produção — SEM o gatilho recalc_sale_total de scripts/alteracoes/10_01.sql
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_name text not null,
  quantity integer not null,
  unit_price numeric not null,
  total_price numeric generated always as ((quantity)::numeric * unit_price) stored,
  created_at timestamptz not null default now()
);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);

-- sale_salespersons: criada à mão no painel (achado 3), nunca versionada
create table if not exists public.sale_salespersons (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  salesperson_id uuid not null references public.salespersons(id) on delete restrict,
  commission_percent numeric(5,2) not null check (commission_percent >= 0),
  commission_value numeric(12,2),
  created_at timestamptz default now(),
  unique (sale_id, salesperson_id)
);

commit;
