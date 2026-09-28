-- sales_with_salespersons — usada pelo Dashboard (dashboard-view.tsx), criada à mão no painel e
-- nunca versionada (achado 4 / Fase 1 §1). A definição real precisa vir do dump da baseline
-- (Fase 1 §3, tarefa manual):
--
--   select pg_get_viewdef('public.sales_with_salespersons'::regclass, true);
--
-- Até lá, este arquivo versiona só o que a Fase 3 muda nela. O formato das colunas que o app lê
-- (id, company_id, status, sale_date, total_price, salespersons[jsonb: id, name,
-- commission_percent]) está espelhado em e2e/mock-server/views.mjs.

alter view public.sales_with_salespersons set (security_invoker = on);
