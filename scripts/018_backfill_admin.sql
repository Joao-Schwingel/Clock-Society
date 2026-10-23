-- 018 — Perfil do admin atual (planejamento 1.6; Fase 3, fatia 3.3). Mesma janela que a 015.
-- Rollback: scripts/rollback/018_backfill_admin.down.sql
--
-- Todo usuário que hoje é dono de dados (tem empresas) vira admin do próprio inquilino, com
-- tenant_id = o próprio id — o user_id das linhas existentes já é esse id, então nenhum dado
-- precisa ser migrado. Se houver mais de um dono (o auto-cadastro esteve aberto), cada um
-- continua isolado no próprio inquilino, exatamente como hoje. A-DB-01 confere o resultado.

begin;

insert into public.profiles (id, tenant_id, role, is_active)
select u.id, u.id, 'admin', true
from auth.users u
where exists (select 1 from public.companies c where c.user_id = u.id)
on conflict (id) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.profiles where role = 'admin' and id = tenant_id;
  raise notice '018: % perfil(is) admin após o backfill — confira com o A-DB-01', n;
end $$;

commit;
