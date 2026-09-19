# Fase 6 — Implementação do papel vendedor

**Objetivo:** implementar o catálogo V-xx em ciclos RED→GREEN, entregar a área do vendedor e a gestão de usuários, e fechar a release com a homologação final.
**Depende de:** Fase 5 aprovada; implantação em produção só depois do período de observação da Fase 4.
**Itens do planejamento:** 1.4 (ramo do vendedor), 1.5, 2.3, Etapa 3, Etapa 4, Etapa 5.

---

## 1. Regras de execução

As mesmas da [Fase 3](fase-3-implementacao-admin.md#1-regras-de-execução), mais:

- **Nenhum teste das Fases 1 e 3 é alterado**, exceto C-DASH-02, que sai junto com o cálculo de comissão do navegador (6.4), e os números de comissão se Q2/Q10 tiverem mudado a regra.
- **`commission_summary()` é revisada como uma política** (§7.1 do planejamento): quem revisa confere a guarda de acesso e que o retorno não tem nenhuma coluna por venda.

---

## 2. Fatias de entrega

| PR | Conteúdo | Planejamento | Migrations | Casos |
|---|---|---|---|---|
| **6.1** | Extração do motor de vendas (`hooks/use-sales-query.ts`), com a origem parametrizada; troca do filtro de vendedor em duas consultas por filtro na view (§7.5). **Refatoração pura, sem comportamento novo** | 4.1 | — | V-REG-02 (a rede é a suíte C-SALES) |
| **6.2** | Ramo do vendedor nas políticas de `companies`, `sales`, `sale_items`, `sale_salespersons`, `salespersons` e `inventory`; linhas do vendedor em `role_permissions`; desativação nas funções auxiliares; `must_change_password` nas claims | 1.4 (vendedor) | nova, ex.: `019_vendor_policies.sql` (rollback = voltar às políticas da 015) | V-DB-01 a 08, 13 a 16 |
| **6.3** | `vendor_sales` e `commission_summary()` com a guarda de acesso, as regras de Q2/Q10 e os grants | 1.5 | `016_vendor_views.sql` | V-DB-09 a 12 |
| **6.4** | Componente compartilhado `commissions-by-salesperson.tsx` sobre a RPC; dashboard do admin passa a usá-la; remoção do cálculo no navegador e da busca de `sale_costs` em lote | 4.5 | — | V-UI-06, V-REG-01 |
| **6.5** | Primeira camada de servidor: `lib/supabase/admin.ts` e `/api/users` | 3.1 | — | V-API-01 a 06 |
| **6.6** | Troca de senha obrigatória: página, guarda no middleware, limpeza da flag | 2.3 | — | V-MW-02, V-UI-08 |
| **6.7** | Tela de Usuários e vínculo login ↔ vendedor; indicação em Configurações | 3.2, 3.3 | — | V-UI-09, V-MW-04 |
| **6.8** | Área do vendedor: layout, seletor de empresa, tabela de vendas configurável, cartões, estoque somente leitura | 4.2, 4.3, 4.4, 4.6 | — | V-MW-01, V-MW-03, V-UI-01 a 05, V-UI-07, V-REG-03 |
| **6.9** | Performance e documentação: `explain analyze` sob RLS, índices, custo do hook; atualizar `CLAUDE.md`; guia do admin | 5.2, 5.3 | — | — |

**Por que 6.1 vem primeiro:** é o segundo maior risco do projeto (sales-view com 910 linhas), e agora
tem rede de proteção. Feita isoladamente, qualquer quebra aponta direto para a extração.

**Dependências:** 6.2 → 6.3 → 6.4; 6.2 → 6.5 → 6.6 → 6.7; 6.1 + 6.3 → 6.8. A 6.4 pode ir para
produção antes do resto, desde que V-REG-01 esteja verde: nesse ponto só o admin a usa.

---

## 3. Detalhes que os testes precisam pegar

| Tema | O que pode dar errado | Caso que pega |
|---|---|---|
| RPC com `security invoker` (§7.1) | Cartões dos outros vendedores zerados e comissão do vendedor inflada, sem erro | V-DB-10, V-DB-12 |
| Coluna por venda na RPC | Vazamento do detalhe das vendas de outros vendedores | V-DB-10 (conjunto exato de colunas) |
| Vendedor inativo e arredondamento (N12, N13) | O admin passa a ver números diferentes depois de 6.4 | V-REG-01 |
| Chave `service_role` no navegador | Import de `lib/supabase/admin.ts` num Client Component | V-API-06 |
| Claim desatualizada (§7.3) | Vendedor desativado continua acessando até a renovação | V-DB-14, V-MW-04 |
| Fuga da troca de senha | Acessar a área por URL direta | V-MW-02 |
| Comissão do período calculada no navegador (N9) | Valor inflado porque o vendedor não lê custos | V-UI-05 |
| URL longa no filtro de vendedor (§7.5) | `.in("id", …)` estourando com muitas vendas | C-SALES-04 após 6.1 |

---

## 4. Homologação final (portão)

Espelha a Fase 4 para o vendedor:

- [ ] Todos os V-xx verdes; suítes das Fases 1 e 3 verdes
- [ ] Runbook de implantação: `019` → `016` → variáveis na Vercel (`SUPABASE_SERVICE_ROLE_KEY`) → deploy do app
- [ ] Em homologação: matriz §8.1 e cenários §8.4 do planejamento executados à mão, com vendedores do fixture; os itens de §8.2 conferidos uma vez com token real via chamada direta à API
- [ ] Ensaiar o rollback (políticas de volta à 015, `drop` de 016, *redeploy* do app)
- [ ] Em produção: retrato antes e depois — os números do admin continuam iguais, respeitadas as decisões de Q2/Q10
- [ ] **Somente depois disso** criar os logins reais dos vendedores, seguindo o guia do admin
- [ ] `CLAUDE.md` atualizado com o modelo de papéis e com a regra "schema só por migration"

---

## 5. Critérios de saída (fim da release)

- [ ] V-xx verdes, sem nenhum `it.todo` restante
- [ ] Homologação final registrada, sem pendências (critério de aceite da Etapa 5)
- [ ] Critérios de aceite das Etapas 3 e 4 do planejamento (§10) atendidos
- [ ] Backlog futuro (§12 do planejamento) atualizado com o que ficou de fora

**Estimativa:** 36,5–38,5 h (30,5 h do planejamento + 6–8 h de testes).
