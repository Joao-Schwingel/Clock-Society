# Fase 3 — Implementação do papel admin

**Objetivo:** implementar o catálogo A-xx em ciclos RED→GREEN. Ao final, o sistema tem papéis; o admin é o único papel funcional e vê exatamente o que via antes.
**Depende de:** Fase 2 aprovada. **Libera:** Fase 4.
**Itens do planejamento:** 1.2, 1.3, 1.4 (só o ramo do admin), 1.6, 2.1, 2.2, 2.4 e os índices de 1.4.

> **Restrição de segurança:** nenhum teste automatizado, nem este agente, toca em banco de dados
> (Fase 1 §1). Os `A-DB-xx` desta fase (a reescrita das ~40 políticas, o item de maior risco do
> projeto) **não têm rede de proteção automatizada** — são um checklist MANUAL (Fase 2 §5), executado
> à mão por um humano contra o Supabase local ou de homologação, antes do merge/deploy de cada fatia.

---

## 1. Regras de execução

1. **Um caso do catálogo por vez:** para UNIT/E2E, transformar o `it.todo` em teste, vê-lo falhar, implementar o mínimo, vê-lo passar. Para os `A-DB-xx` (MANUAL), executar o checklist à mão e anexar o resultado ao PR antes do merge — não há ciclo RED→GREEN automatizado para eles.
2. **Refatoração só com tudo verde** (CI verde + checklist MANUAL da fatia registrado como OK).
3. **Nenhum teste da Fase 1 é alterado**, salvo os quatro da [§6 da Fase 2](fase-2-casos-de-teste-admin.md#6-testes-da-fase-1-que-mudam). Se outro quebrar, é regressão: corrigir o código, não o teste.
4. **Toda migration tem o par de rollback** (§9 do planejamento) e passa pelo A-DB-17 (aplica → reverte → reaplica, à mão, num banco local descartável).
5. **PRs pequenos,** na ordem da §2, com CI verde e checklist MANUAL registrado para o merge.
6. **Toda política nova recebe `comment on policy`** explicando a intenção (A-DB-15, verificado à mão).

---

## 2. Fatias de entrega

| PR | Conteúdo | Planejamento | Migrations | Casos |
|---|---|---|---|---|
| **3.1** | Fechar brechas: RLS em `sale_items` e `sale_salespersons`; views com `security_invoker`; revogar `anon` | 1.2 | `012_fix_missing_rls.sql`, `views/*` | A-DB-04, A-DB-06 (views e `sale_items`), A-DB-09 |
| **3.2** | Identidade: `profiles`, `profile_salespersons`, `role_permissions` (só as linhas do admin), gatilho de criação de perfil, funções auxiliares, hook de token, RLS de `profiles` | 1.3 | `013_create_profiles.sql`, `014_auth_helpers.sql` | A-DB-02, A-DB-03, A-DB-12, A-DB-13, A-DB-14 |
| **3.3** | Políticas das 10 tabelas no padrão "admin do inquilino"; `default current_tenant_id()` em `user_id`; índices; backfill do admin | 1.4 (admin), 1.6 | `015_rewrite_policies.sql`, `017_indexes.sql`, `018_backfill_admin.sql` | A-DB-01, A-DB-05 a A-DB-11, A-DB-15, A-DB-16 |
| **3.4** | `SessionProvider`, `usePermissions`, `<Can>`, `nav-registry`; abas de `dashboard-layout.tsx` e `company-dashboard.tsx` montadas pelo registro; fim do uso do id do usuário logado em filtros e inserções (N3) | 2.1 | — | A-PERM-01 a 06, A-TEN-01, A-BOOT-02 |
| **3.5** | Middleware por papel a partir das claims do token; `app/403/page.tsx`; redirecionamento pós-login por papel; `/auth/sign-up*` fora das rotas públicas | 2.2 | — | A-MW-01 a 06 |
| **3.6** | Fim da auto-criação de empresas; estado vazio | 2.4 | — | A-BOOT-01 |

**Dependências:**

```
3.1 ──────────────────────────────────────────► (pode ir para produção sozinho)
3.2 ──► 3.3 ──┐
  │           ├──► implantação conjunta na Fase 4
  └─► 3.4 ────┤
  └─► 3.5 ────┤
      3.6 ────┘
```

Os casos `A-DB-xx`/`A-TEN-01` de cada fatia são o checklist **MANUAL** da Fase 2 §5: quem entrega a
fatia executa esses itens à mão contra o Supabase local ou de homologação e anexa o resultado ao PR.
Eles não aparecem no CI. Os demais casos da coluna (`A-MW-*`, `A-PERM-*`, `A-BOOT-*`) são UNIT/E2E
automatizados normalmente.

- **3.1 é independente** e fecha brechas existentes sem mudar nada para o admin (desde que o A-DB-04 esteja OK no checklist). Recomendação: implantar assim que estiver pronto, com um mini-roteiro da Fase 4 (só §3.3 e a verificação de segurança), sem esperar o restante.
- **3.3 é o ponto de não retorno:** a partir dele o banco depende de `profiles`. `015` e `018` vão para produção na mesma janela (§5 do planejamento).
- **3.4 e 3.5 dependem das claims** (3.2) e vão para produção junto com 3.3, com o hook já habilitado.

---

## 3. Detalhes que os testes precisam pegar

| Tema | O que pode dar errado | Caso que pega |
|---|---|---|
| `security_invoker` nas views (§7.4) | Política mais restritiva do que o esperado faz a tela do admin perder linhas **sem erro** | A-DB-04, antes do merge de 3.1 |
| Recursão em `profiles` (§7.2) | Política de `profiles` chamando função que consulta `profiles` | A-DB-12 |
| Claims no middleware (N10) | Ler o papel via `getUser()` devolve o registro sem as claims do hook → admin cai em `/403` | A-MW-02 |
| Token antigo após a implantação (§7.3) | Admin logado antes da janela fica preso em `/403` | A-MW-06 |
| Escalada de privilégio | Usuário altera o próprio `role` em `profiles` pelo cliente | A-DB-12 |
| `user_id` com o id do usuário logado (N3) | Invisível com um só admin; aparece com o segundo login do mesmo inquilino | A-DB-11, A-TEN-01 |
| Tela quebrada sem empresas (N4) | `companies[0].code` com lista vazia | A-BOOT-01 |
| Aba proibida via URL (N11) | `?tab=` renderiza aba que o papel não tem | A-PERM-05 |

---

## 4. Artefatos de implantação (entrada da Fase 4)

- [ ] **Runbook** com a ordem exata: backup → 012 → 013 → 014 → habilitar o hook no painel → 015 + 017 + 018 na mesma transação ou em sequência imediata → verificação → deploy do app (3.4–3.6) → desabilitar auto-cadastro, se ainda não tiver sido feito (ação imediata do README)
- [ ] Scripts de rollback de cada migration, testados localmente (A-DB-17), mais a linha de base de políticas salva na Fase 1
- [ ] Rollback do app: identificar o deploy anterior na Vercel para *redeploy* imediato
- [ ] `explain analyze` das três consultas mais pesadas do admin — vendas paginadas, estatísticas de vendas e dashboard — antes e depois das novas políticas, executado à mão (fora da suíte automatizada) num banco local com volume parecido com o de produção (antecipa parte de 5.2)

---

## 5. Critérios de saída

- [ ] Todos os A-xx das camadas UNIT/E2E verdes no CI; nenhum `it.todo` restante do catálogo
- [ ] Todos os A-DB-xx (MANUAL) executados e registrados para cada fatia, antes do respectivo merge/deploy
- [ ] Suíte da Fase 1 verde, com exceção apenas dos casos substituídos
- [ ] `select * from pg_policies` cobre as 10 tabelas, todas comentadas (critério de aceite da Etapa 1)
- [ ] Nenhuma lista fixa de abas restou nos componentes (critério de aceite da Etapa 2)
- [ ] Runbook e rollbacks revisados por uma segunda pessoa
- [ ] Sem piora relevante nos `explain analyze` da §4

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Hook desabilitado ou falhando em produção → middleware sem claims → admin bloqueado | Runbook verifica o hook antes do deploy do app; as funções auxiliares têm queda para `profiles` (A-DB-03), então o banco continua respondendo; o rollback do app é um *redeploy* |
| Backfill fora da janela → admin sem perfil → nada visível | `015` e `018` juntos; A-DB-01 e A-DB-04 verdes no ensaio da Fase 4 |
| Divergência entre o banco local e produção | A baseline veio do dump da Fase 1; conferir com novo dump imediatamente antes da janela |
| Escopo vazar para o vendedor | Qualquer ramo `or exists (… my_salesperson_ids() …)` nesta fase é bloqueado na revisão (D-6) |

**Estimativa:** 15,5–17,5 h (11,5 h do planejamento + 4–6 h de testes).
