-- 017 — Índices de apoio às novas políticas (planejamento 1.4; Fase 3, fatia 3.3).
-- Rollback: scripts/rollback/017_indexes.down.sql
-- (016_vendor_views.sql é da Fase 6.)

create index if not exists idx_profiles_tenant_role on public.profiles (tenant_id, role);
create index if not exists idx_profile_salespersons_profile on public.profile_salespersons (profile_id);
create index if not exists idx_sale_salespersons_salesperson_sale on public.sale_salespersons (salesperson_id, sale_id);
