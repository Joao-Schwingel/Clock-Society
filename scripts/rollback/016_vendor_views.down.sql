-- Reverte a 016. Antes: publicar o app sem a área do vendedor e sem o dashboard sobre a RPC.

begin;

drop function if exists public.commission_summary(uuid, int, int[]);
drop view if exists public.vendor_sales;

commit;
