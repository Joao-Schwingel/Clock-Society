-- Reverte a 020. Em construção junto com ela (Fase 6).

begin;

alter table public.profiles drop constraint if exists profiles_admin_always_active;

delete from public.role_permissions where role = 'admin' and permission = 'users.manage';

commit;
