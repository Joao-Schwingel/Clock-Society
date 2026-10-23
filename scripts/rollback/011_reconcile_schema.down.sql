-- 011 não tem reversão: em produção ela não altera nada (tudo já existia), e num banco novo ela
-- cria estruturas que as demais migrations e o app exigem. Planejamento §9: "nenhuma alteração
-- destrutiva; nada a reverter". Este arquivo existe só para o A-DB-17 registrar isso.
select 'nada a reverter na 011' as info;
