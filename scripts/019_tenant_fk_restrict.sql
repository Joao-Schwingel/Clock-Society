-- 019 — Apagar o usuário dono dos dados deixa de apagar todos os dados (item 4 da revisão de
-- 28/09/2026). Independente das demais: pode ir junto com a 012 (fatia 3.1).
-- Rollback: scripts/rollback/019_tenant_fk_restrict.down.sql
-- NUNCA aplicada por CI nem por agente de IA — ver docs/fase-3/runbook.md.
--
-- A partir da Fase 3, user_id é o INQUILINO, e o inquilino é o auth.users.id do admin original.
-- Com ON DELETE CASCADE, apagar esse usuário (ex.: pelo painel do Supabase) apagaria em cascata
-- todas as empresas, vendas, custos, contratos, estoque e vendedores. Com RESTRICT, o banco recusa
-- apagar um usuário que ainda é dono de dados. Nada muda no uso normal do app.
--
-- As 6 FKs diretas são as de produção (backups/schema.sql). sale_costs e fixed_costs não têm FK
-- para auth.users; sales, sale_items, sale_salespersons etc. dependem de companies.

begin;

alter table public.companies    drop constraint if exists companies_user_id_fkey;
alter table public.contracts    drop constraint if exists contracts_user_id_fkey;
alter table public.costs        drop constraint if exists costs_user_id_fkey;
alter table public.inventory    drop constraint if exists inventory_user_id_fkey;
alter table public.sales        drop constraint if exists sales_user_id_fkey;
alter table public.salespersons drop constraint if exists salespersons_user_id_fkey;

alter table public.companies    add constraint companies_user_id_fkey    foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.contracts    add constraint contracts_user_id_fkey    foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.costs        add constraint costs_user_id_fkey        foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.inventory    add constraint inventory_user_id_fkey    foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.sales        add constraint sales_user_id_fkey        foreign key (user_id) references auth.users(id) on delete restrict;
alter table public.salespersons add constraint salespersons_user_id_fkey foreign key (user_id) references auth.users(id) on delete restrict;

commit;
