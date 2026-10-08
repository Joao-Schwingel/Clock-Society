-- 020 — Papel vendedor no banco (planejamento 1.4, ramo do vendedor; Fase 6, fatia 6.2).
-- Rollback: scripts/rollback/020_vendor_policies.down.sql
-- NUNCA aplicada por CI nem por agente de IA. Pré-requisito: 019_fix_missing_rls.sql (issue #9).
--
-- Em construção na Fase 6: a fatia 6.7 adicionou o catálogo de users.manage e a regra "admin
-- nunca é desativado"; a 6.2 acrescenta
-- my_salesperson_ids(), as políticas do vendedor, as linhas do vendedor em role_permissions, a
-- marca must_change_password no hook e a desativação nas funções auxiliares.

begin;

-- 1. Catálogo: gestão de usuários (Fase 6, fatia 6.7). Espelhado em lib/auth/permissions.ts
--    (A-PERM-01 lê os inserts de todas as migrations como texto).
insert into public.role_permissions (role, permission) values
  ('admin', 'users.manage')
on conflict do nothing;

-- 2. Nenhum administrador pode ser desativado (decisão do responsável, 08/10/2026). A API recusa
--    antes (lib/users/service.ts); esta restrição garante o mesmo para qualquer escrita — chave de
--    serviço, SQL Editor ou painel. Hoje todos os admins estão ativos, então ela valida sem erro.
alter table public.profiles
  add constraint profiles_admin_always_active check (role <> 'admin' or is_active);

commit;
