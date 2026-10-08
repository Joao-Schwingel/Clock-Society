-- 020 — Papel vendedor no banco (planejamento 1.4, ramo do vendedor; Fase 6, fatias 6.2 e 6.7).
-- Rollback: scripts/rollback/020_vendor_policies.down.sql
-- NUNCA aplicada por CI nem por agente de IA. Pré-requisito: 019_fix_missing_rls.sql (issue #9).
-- Verificação: checklist MANUAL V-DB-01 a 08 e 13 a 18 (docs/manual-checklists/fase-5-…).
--
-- As políticas do admin (015, "for all") continuam como estão. O vendedor ganha políticas de
-- LEITURA adicionais (permissivas — somam com as do admin); nenhuma de escrita.
--
-- Armadilha de recursão (§7.2): a política do vendedor em `sales` precisa olhar `sale_salespersons`,
-- e a do admin em `sale_salespersons` já olha `sales`. Referência direta nos dois sentidos faz o
-- Postgres recusar QUALQUER consulta ("infinite recursion detected in policy"), inclusive a do
-- admin. Por isso o vendedor consulta os vínculos por funções `security definer`, que não passam
-- pelo RLS e quebram o ciclo.

begin;

-- 1. Catálogo. Espelhado em lib/auth/permissions.ts (A-PERM-01 lê estes inserts como texto).
--    users.manage: gestão de usuários, só admin (6.7). Vendedor: Vendas, Comissões e Estoque, só
--    leitura; sem exportação enquanto a Q4 (#13) não for respondida (padrão do planejamento).
insert into public.role_permissions (role, permission) values
  ('admin', 'users.manage'),
  ('vendedor', 'commissions.view'),
  ('vendedor', 'sales.view'),
  ('vendedor', 'inventory.view')
on conflict do nothing;

-- 2. Nenhum administrador pode ser desativado (decisão do responsável, 08/10/2026). A API recusa
--    antes (lib/users/service.ts); esta restrição garante o mesmo para qualquer escrita — chave de
--    serviço, SQL Editor ou painel. Hoje todos os admins estão ativos, então ela valida sem erro.
alter table public.profiles
  add constraint profiles_admin_always_active check (role <> 'admin' or is_active);

-- 3. Funções auxiliares: perfil desativado perde o acesso já na próxima consulta, mesmo com um
--    token ainda válido que traga as claims (decisão 3.7; §7.3).
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_active) then null
    else coalesce(
      nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
      (select p.tenant_id from public.profiles p where p.id = auth.uid() and p.is_active)
    )
  end
$$;

create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_active) then null
    else coalesce(
      nullif(auth.jwt() -> 'app_metadata' ->> 'app_role', ''),
      (select p.role from public.profiles p where p.id = auth.uid() and p.is_active)
    )
  end
$$;

create or replace function public.is_vendor()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'vendedor', false)
$$;

-- Registros de vendedor do login atual (só perfil ativo de vendedor).
create or replace function public.my_salesperson_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select ps.salesperson_id
  from public.profile_salespersons ps
  join public.profiles p on p.id = ps.profile_id
  where ps.profile_id = auth.uid() and p.is_active and p.role = 'vendedor'
$$;

-- Empresas em que o vendedor atua.
create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct sp.company_id
  from public.salespersons sp
  where sp.id in (select public.my_salesperson_ids())
$$;

-- A venda tem o vendedor logado entre os vendedores? (lê sale_salespersons sem RLS — ver topo)
create or replace function public.vendor_can_see_sale(p_sale_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sale_salespersons ss
    where ss.sale_id = p_sale_id
      and ss.salesperson_id in (select public.my_salesperson_ids())
  )
$$;

revoke execute on function public.is_vendor(), public.my_salesperson_ids(), public.my_company_ids(),
  public.vendor_can_see_sale(uuid) from public, anon;
grant execute on function public.is_vendor(), public.my_salesperson_ids(), public.my_company_ids(),
  public.vendor_can_see_sale(uuid) to authenticated;

-- 4. Hook de token: passa a incluir must_change_password (decisão 3.6). Perfil inativo continua
--    sem claims (o middleware nega).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  prof record;
begin
  select p.role, p.tenant_id, p.is_active, p.must_change_password into prof
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  claims := claims #- '{app_metadata,app_role}' #- '{app_metadata,tenant_id}' #- '{app_metadata,must_change_password}';

  if found and prof.is_active then
    claims := jsonb_set(claims, '{app_metadata,app_role}', to_jsonb(prof.role));
    claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(prof.tenant_id::text));
    if prof.must_change_password then
      claims := jsonb_set(claims, '{app_metadata,must_change_password}', 'true'::jsonb);
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- 5. Políticas de LEITURA do vendedor (Anexo B do planejamento). sale_costs, fixed_costs,
--    contracts e costs não ganham política: o vendedor lê 0 linhas (V-DB-03/06).
create policy "companies_vendor_select" on public.companies
  for select to authenticated
  using (user_id = public.current_tenant_id() and public.is_vendor() and id in (select public.my_company_ids()));
comment on policy "companies_vendor_select" on public.companies is
  'Fase 6: o vendedor lê só as empresas em que atua (V-DB-04).';

create policy "sales_vendor_select" on public.sales
  for select to authenticated
  using (user_id = public.current_tenant_id() and public.is_vendor() and public.vendor_can_see_sale(id));
comment on policy "sales_vendor_select" on public.sales is
  'Fase 6: o vendedor lê só as vendas em que consta em sale_salespersons; a compartilhada aparece para os dois (V-DB-01).';

create policy "sale_items_vendor_select" on public.sale_items
  for select to authenticated
  using (public.is_vendor() and public.vendor_can_see_sale(sale_id));
comment on policy "sale_items_vendor_select" on public.sale_items is
  'Fase 6: o vendedor lê os itens só das próprias vendas (V-DB-02).';

create policy "sale_salespersons_vendor_select" on public.sale_salespersons
  for select to authenticated
  using (public.is_vendor() and salesperson_id in (select public.my_salesperson_ids()));
comment on policy "sale_salespersons_vendor_select" on public.sale_salespersons is
  'Fase 6: o vendedor lê só as PRÓPRIAS linhas — nunca o percentual do colega numa venda compartilhada (V-DB-17).';

create policy "salespersons_vendor_select" on public.salespersons
  for select to authenticated
  using (user_id = public.current_tenant_id() and public.is_vendor() and id in (select public.my_salesperson_ids()));
comment on policy "salespersons_vendor_select" on public.salespersons is
  'Fase 6: o vendedor lê só os próprios registros de vendedor (V-DB-04).';

create policy "inventory_vendor_select" on public.inventory
  for select to authenticated
  using (user_id = public.current_tenant_id() and public.is_vendor() and company_id in (select public.my_company_ids()));
comment on policy "inventory_vendor_select" on public.inventory is
  'Fase 6: o vendedor lê o estoque (com custo) das empresas em que atua; não escreve (V-DB-05/07).';

-- 6. Views antigas só para o admin (decisão 3.4): o vendedor usa vendor_sales (016). Sem isto ele
--    veria nelas as próprias vendas com custos zerados — número enganoso (V-DB-08).
create or replace view public.sales_with_details with (security_invoker = on) as
select
  s.id,
  s.company_id,
  s.user_id,
  s.order_number,
  s.product_name,
  s.customer_name,
  s.sale_date,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.entry_value,
  s.status,
  s.payment_status,
  s.notes,
  s.created_at,
  coalesce(sp_data.salespersons, '[]'::jsonb) as salespersons,
  coalesce(sc_data.costs, '[]'::jsonb) as costs,
  coalesce(sc_data.total_costs, 0::numeric) as total_costs
from public.sales s
  left join (
    select
      ssp.sale_id,
      jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent)) as salespersons
    from public.sale_salespersons ssp
      join public.salespersons sp on sp.id = ssp.salesperson_id
    group by ssp.sale_id
  ) sp_data on sp_data.sale_id = s.id
  left join (
    select
      sc.sale_id,
      jsonb_agg(sc.*) as costs,
      sum(sc.amount) as total_costs
    from public.sale_costs sc
    group by sc.sale_id
  ) sc_data on sc_data.sale_id = s.id
where public.is_admin();

create or replace view public.sales_with_salespersons with (security_invoker = on) as
select
  s.id,
  s.company_id,
  s.product_name,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.sale_date,
  s.customer_name,
  s.notes,
  s.user_id,
  s.created_at,
  s.salesperson,
  s.status,
  s.salesperson_id,
  s.order_number,
  s.entry_value,
  s.payment_status,
  jsonb_agg(
    jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent)
  ) filter (where sp.id is not null) as salespersons
from public.sales s
  left join public.sale_salespersons ssp on ssp.sale_id = s.id
  left join public.salespersons sp on sp.id = ssp.salesperson_id
where public.is_admin()
group by s.id;

commit;
