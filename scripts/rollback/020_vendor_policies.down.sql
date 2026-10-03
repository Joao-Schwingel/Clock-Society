-- Reverte a 020. Em construção junto com ela (Fase 6).

begin;

delete from public.role_permissions where role = 'admin' and permission = 'users.manage';

commit;
