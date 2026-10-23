-- Retrato dos números de produção (Fase 1 §6).
-- SOMENTE LEITURA. Nenhuma linha aqui escreve, atualiza ou apaga dado algum.
-- Execute manualmente no SQL Editor do Supabase (idealmente com uma
-- credencial só de leitura), nunca via automação, nunca por este agente.
--
-- As colunas usadas aqui refletem o schema visto pelo front (lib/types.ts e
-- scripts/views/sales_with_details.sql). Se o dump real (item 1.1 do
-- planejamento) divergir, ajuste os nomes de coluna antes de rodar.

-- ── 1. Agregados por empresa × mês (vendas, 2025-2026) ──────────────────
select
  c.code                                    as empresa,
  date_trunc('month', s.sale_date)::date    as mes,
  s.status,
  count(*)                                   as qtd_vendas,
  sum(s.total_price)                         as soma_total_price,
  sum(coalesce(sc.total_custos, 0))          as soma_custos_venda,
  sum(s.quantity)                            as soma_quantidade_header
from public.sales s
join public.companies c on c.id = s.company_id
left join (
  select sale_id, sum(amount) as total_custos
  from public.sale_costs
  group by sale_id
) sc on sc.sale_id = s.id
where s.sale_date >= '2025-01-01' and s.sale_date < '2027-01-01'
group by c.code, date_trunc('month', s.sale_date), s.status
order by empresa, mes, s.status;

-- ── 2. Comissão por vendedor, pela regra atual (C-DASH-02) ───────────────
-- comissão = (total_price - custos_da_venda) × commission_percent ÷ 100,
-- só vendas concluídas; venda com 2+ vendedores conta o valor cheio pra
-- cada um (achado 9); não filtra vendedor inativo (N12).
select
  c.code                             as empresa,
  date_trunc('month', s.sale_date)::date as mes,
  sp.name                            as vendedor,
  sp.is_active                       as vendedor_ativo,
  count(*)                           as qtd_vendas,
  sum(s.total_price)                 as soma_total_price,
  sum(
    (s.total_price - coalesce(sc.total_custos, 0)) * ssp.commission_percent / 100
  )                                  as comissao_total
from public.sales s
join public.companies c on c.id = s.company_id
join public.sale_salespersons ssp on ssp.sale_id = s.id
join public.salespersons sp on sp.id = ssp.salesperson_id
left join (
  select sale_id, sum(amount) as total_custos
  from public.sale_costs
  group by sale_id
) sc on sc.sale_id = s.id
where s.status = 'concluída'
  and s.sale_date >= '2025-01-01' and s.sale_date < '2027-01-01'
group by c.code, date_trunc('month', s.sale_date), sp.name, sp.is_active
order by empresa, mes, vendedor;

-- ── 3. Contagem de linhas por tabela ──────────────────────────────────────
select 'companies' as tabela, count(*) as linhas from public.companies
union all select 'salespersons', count(*) from public.salespersons
union all select 'sales', count(*) from public.sales
union all select 'sale_items', count(*) from public.sale_items
union all select 'sale_salespersons', count(*) from public.sale_salespersons
union all select 'sale_costs', count(*) from public.sale_costs
union all select 'fixed_costs', count(*) from public.fixed_costs
union all select 'contracts', count(*) from public.contracts
union all select 'inventory', count(*) from public.inventory
order by tabela;
