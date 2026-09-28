-- Reverte a 018: remove SÓ os perfis criados pelo backfill (admin dono do próprio inquilino e
-- dono de empresas), nunca a tabela inteira (decisão da Fase 2 — há perfis de seed/Fase 6).
-- Depois disso, sem a 015 revertida, esses usuários deixam de ver qualquer dado.

begin;

delete from public.profiles p
where p.role = 'admin'
  and p.id = p.tenant_id
  and exists (select 1 from public.companies c where c.user_id = p.id);

commit;
