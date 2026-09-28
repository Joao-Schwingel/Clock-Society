# Fase 2 — Casos de teste: papel admin

**Objetivo:** definir e aprovar, antes de qualquer implementação, os comportamentos que provam que o sistema passou a ter papéis — com o admin como único papel funcional — e que o admin continua vendo exatamente o mesmo de antes.
**Depende de:** Fase 1 (suíte verde, fixture, checklist MANUAL definido). **Libera:** Fase 3.

> **Restrição de segurança:** nenhum teste automatizado toca em banco de dados (Fase 1 §1). Por isso o
> catálogo abaixo tem uma camada nova, **MANUAL** — um checklist executado à mão, nunca por este agente,
> nunca em CI — além das camadas UNIT e E2E (com rede mockada) já usadas na Fase 1.

---

## 1. Como esta fase aplica a skill `tdd`

Esta fase é a etapa de *Planning* da skill, feita com o time e não por uma pessoa só:

| Checklist da skill | Onde está neste documento |
|---|---|
| Confirmar as mudanças de interface | §3 |
| Confirmar quais comportamentos testar e priorizar | §5 (coluna Prioridade) |
| Desenhar interfaces testáveis | §3 |
| Listar comportamentos, não passos de implementação | §5 |
| Obter aprovação | §8 |

**Não se escrevem asserções nesta fase.** Os casos da camada UNIT entram no código como
`it.todo("A-MW-01 …")` (Vitest) e os da camada E2E como `test.fixme("A-MW-01 …", () => {})`
(Playwright, que não tem `it.todo`), agrupados por arquivo de teste; cada `todo` vira teste de verdade dentro do
ciclo RED→GREEN da Fase 3. Os casos **MANUAL** (catálogo "Banco", §5) não viram `it.todo` — entram como
linhas de um checklist (markdown ou planilha), sem execução ainda, que a Fase 3 executa à mão a cada
fatia entregue.

---

## 2. O que "suportar o papel admin" inclui

**Inclui:**

- Identidade: `profiles`, inquilino, papel e claims no token (planejamento 1.3)
- Banco que nega por padrão: toda política exige ser admin do inquilino (1.4, só o ramo do admin — D-6)
- Brechas atuais fechadas: `sale_items`, `sale_salespersons`, views com `security_invoker`, grants do `anon` (1.2)
- Camada de permissão no front aplicada a **todas** as telas: `SessionProvider`, `usePermissions`, `<Can>`, `nav-registry` (2.1)
- Middleware por papel, página 403, auto-cadastro fechado, redirecionamento pós-login por papel (2.2)
- Dashboard sem auto-criação de empresas (2.4)
- `tenant_id` no lugar do id do usuário logado em filtros e inserções (N3)
- Backfill do admin atual (1.6)

**Não inclui** (Fase 5/6): qualquer acesso do vendedor, `vendor_sales`, `commission_summary()`, gestão
de usuários, troca de senha obrigatória, área do vendedor.

---

## 3. Decisões de interface a fechar

### 3.1 Catálogo de permissões (proposta)

| Permissão | Protege | Admin (Fase 3) | Vendedor (Fase 6, referência) |
|---|---|---|---|
| `dashboard.overview` | Os 6 cartões de visão geral | ✓ | — |
| `commissions.view` | Comissões por vendedor | ✓ | ✓ |
| `sales.view` | Aba Vendas | ✓ | ✓ |
| `sales.view_costs` | Custos, coluna líquida (N7), detalhe da venda | ✓ | — |
| `sales.write` | Nova, editar, excluir, status, pagamento, custos da venda | ✓ | — |
| `sales.export` | Exportar CSV | ✓ | Q4 |
| `inventory.view` | Aba Estoque | ✓ | ✓ |
| `inventory.write` | Novo, editar e excluir item | ✓ | — |
| `fixed_costs.manage` | Aba Custos | ✓ | — |
| `contracts.manage` | Aba Contratos | ✓ | — |
| `salespersons.manage` | Configurações | ✓ | — |

`users.manage` entra no catálogo na Fase 6, junto com a tela.

### 3.2 Sessão no front

`{ userId, tenantId, role, salespersonIds, permissions }`, montada a partir das claims do token e de
`role_permissions`. Nenhum componente volta a receber `userId` para filtrar ou inserir dados (N3).

### 3.3 Onde ficam as claims e como o middleware as lê

- Claims em `app_metadata.app_role` e `app_metadata.tenant_id` do access token (planejamento §4.2).
- O middleware lê as claims **do token**; `auth.getUser()` não as enxerga (N10). Verificar se a versão
  fixada do `supabase-js` oferece `auth.getClaims()`; senão, decodificar o access token já validado.

### 3.4 Tabela de decisão do middleware

| Situação | Resultado |
|---|---|
| Sem sessão, rota pública (`/`, `/auth/login`, `/auth/error`) | Segue |
| Sem sessão, qualquer outra rota — inclusive `/auth/sign-up*` | `/auth/login` |
| Sessão com `app_role = admin` | Segue |
| Sessão sem claim de papel (token emitido antes do hook) | Renova a sessão uma vez; continuando sem claim → `/403` |
| Sessão de usuário sem perfil, ou com papel sem permissão para a área | `/403`, com botão "Sair" |

### 3.5 Bloqueio por aba (N11)

Como Custos, Contratos e Configurações são abas de `/dashboard`, e não rotas, o bloqueio de aba é do
`nav-registry`: `?tab=` ou `?company=` apontando para aba não permitida mostra o componente de acesso
negado, e não a aba. A proteção real continua sendo o RLS.

### 3.6 `user_id` nas inserções

**Decidido:** coluna com `default public.current_tenant_id()` nas 8 tabelas que têm `user_id`
(`sale_items` e `sale_salespersons` não têm: derivam de `sales`), e política com
`with check (user_id = current_tenant_id() and is_admin())`. O front deixa de enviar `user_id` nas 7
inserções (N3). *(Descartada: o front enviar o `tenantId` da sessão.)*

### 3.7 Estado vazio sem empresas

Mensagem em PT-BR ("Nenhuma empresa disponível.") no lugar da tela quebrada (N4). Não cria nada.

---

## 4. Fixtures adicionais

| Login | Perfil | Inquilino | Serve para |
|---|---|---|---|
| `admin@t1` | admin | T1 | Todos os casos positivos e a regressão |
| `admin2@t1` | admin | T1 | A-DB-11, A-TEN-01 (Q7) |
| `outro@t2` | admin | T2 | Isolamento entre inquilinos |
| `semperfil@t1` | — (sem linha em `profiles`) | — | Nega por padrão |
| `vendedor-sem-vinculo@t1` | vendedor, sem `profile_salespersons` | T1 | Nega por padrão — continua valendo depois da Fase 6 |
| (sem sessão) | — | — | Grants do `anon` |

Helpers de teste: `loginAs(fixtureUser)` devolvendo um cliente `supabase-js` autenticado, e uma
função que lê as claims do token da sessão.

---

## 5. Catálogo A-xx

Prioridade: **P1** = bloqueia a Fase 4; **P2** = importante, mas a Fase 4 pode compensar com verificação manual.

### Banco (checklist MANUAL — nunca automatizado, nunca executado por este agente)

Nenhum destes casos vira `it.todo`. São um checklist executado à mão contra o Supabase local ou de
homologação, por um humano, antes do merge/deploy da fatia correspondente (§2 da Fase 3) — não bloqueiam
o CI, mas bloqueiam a saída da fatia.

| ID | Pri. | Comportamento |
|---|---|---|
| A-DB-01 | P1 | Após o backfill, o admin atual tem perfil `admin`, `tenant_id` igual ao próprio id e está ativo |
| A-DB-02 | P1 | O token do admin traz `app_role = admin` e `tenant_id`; o de um usuário sem perfil não traz nenhum dos dois |
| A-DB-03 | P1 | `current_tenant_id()`, `current_app_role()` e `is_admin()` dão o mesmo resultado com e sem as claims no token (queda para `profiles`) |
| A-DB-04 | P1 | **Regressão:** o admin lê exatamente as contagens do fixture nas 10 tabelas e nas 2 views — C-DB-01 repetido com as novas políticas e o `security_invoker` (§7.4 do planejamento) |
| A-DB-05 | P1 | O admin cria, altera e exclui em todas as tabelas que o front escreve — C-DB-02 repetido |
| A-DB-06 | P1 | Outro inquilino: 0 linhas em todas as tabelas, nas 2 views e em `sale_items`; escrita negada. **C-DB-05 passa a valer** |
| A-DB-07 | P1 | Usuário autenticado sem perfil: 0 linhas em tudo; escrita negada |
| A-DB-08 | P1 | Perfil `vendedor` sem vínculo: 0 linhas em tudo; escrita negada |
| A-DB-09 | P1 | Chave anônima: nenhuma tabela, view ou função legível. **C-DB-04 passa a valer** |
| A-DB-10 | P1 | Inserção sem `user_id` recebe o inquilino; inserção ou alteração com `user_id` de outro inquilino é recusada |
| A-DB-11 | P2 | Segundo admin do mesmo inquilino lê e escreve os mesmos dados que o primeiro |
| A-DB-12 | P1 | `profiles`: o admin lê os perfis do inquilino; cada usuário lê o próprio; **nenhum usuário altera `role`, `tenant_id`, `is_active` ou `must_change_password` pelo cliente**; a consulta não entra em recursão (§7.2) |
| A-DB-13 | P2 | `role_permissions` é legível por usuários autenticados e não aceita escrita pelo cliente |
| A-DB-14 | P2 | `profile_salespersons`: o mesmo registro de vendedor não pode ser vinculado a dois perfis |
| A-DB-15 | P2 | Toda política do schema `public` tem `comment on policy` (critério de aceite da Etapa 1) |
| A-DB-16 | P2 | Criar empresa continua criando o vendedor "Site" sob as novas políticas (C-SET-02 repetido) |
| A-DB-17 | P1 | Cada migration da fase aplica, reverte (§9 do planejamento) e reaplica num banco local descartável sem erro |

**Dois casos saem daqui porque não precisam de banco de verdade para serem provados:**

- **A-PERM-01** (abaixo, "Permissões e navegação") deixa de ser "teste de deriva contra o banco local":
  vira **UNIT**, comparando o catálogo do front contra o SQL de seed de `role_permissions` como arquivo
  de texto (parse estático), sem abrir conexão nenhuma.
- **A-BOOT-02** (abaixo, "Inicialização e inquilino") vira **E2E** com rede mockada: em vez de confirmar
  que o RLS filtra de verdade, o teste intercepta a requisição de `companies` e afirma que ela **não**
  envia mais `eq.user_id=<uid>` — verifica o que a tela manda, não o que o banco responde.

### Middleware e rotas

| ID | Pri. | Comportamento |
|---|---|---|
| A-MW-01 | P1 | Sem sessão → `/auth/login` (C-AUTH-01 repetido) |
| A-MW-02 | P1 | Admin com token válido acessa `/dashboard`; a decisão vem das claims do token (§3.3) — E2E com um JWT fabricado (claims `app_role`/`tenant_id` de fixture), não com um login real contra o Supabase Auth |
| A-MW-03 | P1 | `/auth/sign-up` e `/auth/sign-up-success` deixam de ser públicas. **Substitui C-AUTH-05** |
| A-MW-04 | P1 | Usuário sem perfil e perfil sem permissão para a área → `/403`, com mensagem em PT-BR e botão "Sair" |
| A-MW-05 | P2 | Depois do login, o admin vai para `/dashboard`; a regra de destino por papel fica num único lugar |
| A-MW-06 | P1 | Sessão aberta antes da implantação (token sem claims) continua funcionando depois da renovação, sem ficar presa em `/403` — E2E com um JWT de fixture sem as claims novas, simulando o token antigo |

### Permissões e navegação

| ID | Pri. | Comportamento |
|---|---|---|
| A-PERM-01 | P1 | O catálogo do front é igual ao conteúdo de `role_permissions` — UNIT: parse do SQL de seed como arquivo de texto, sem abrir conexão com banco nenhum |
| A-PERM-02 | P1 | O admin tem todas as permissões do catálogo |
| A-PERM-03 | P2 | `<Can>` mostra o conteúdo com a permissão e o `fallback` sem ela |
| A-PERM-04 | P1 | O registro de navegação gera para o admin exatamente as abas de hoje, na mesma ordem — C-NAV-01/02 continuam verdes sem alteração |
| A-PERM-05 | P1 | Papel sem a permissão não vê a aba; `?tab=`/`?company=` apontando para aba não permitida mostra acesso negado (testado com um papel fictício) |
| A-PERM-06 | P2 | O botão "Configurações" depende de `salespersons.manage` |

### Inicialização e inquilino

| ID | Pri. | Comportamento |
|---|---|---|
| A-BOOT-01 | P1 | Entrar sem empresas mostra o estado vazio, sem quebrar (N4), e não cria nada. **Substitui C-NAV-04** |
| A-BOOT-02 | P2 | As empresas chegam sem filtro pelo id do usuário logado — E2E com rede mockada: afirma que a requisição de `companies` não envia `eq.user_id=<uid>`, não que o RLS filtra de verdade |
| A-TEN-01 | P1 | **MANUAL.** Logado como o segundo admin do mesmo inquilino, todas as telas mostram os mesmos números que para o primeiro — detecta qualquer uso remanescente do id do usuário logado (N3). Precisa de duas sessões reais contra o mesmo banco; não dá para mockar sem esvaziar o teste |

### Regressão

| ID | Pri. | Comportamento |
|---|---|---|
| A-REG-01 | P1 | Toda a suíte da Fase 1 continua verde, exceto C-AUTH-05, C-NAV-04, C-DB-04 e C-DB-05, substituídos pelos casos acima |

---

## 6. Testes da Fase 1 que mudam

| Caso da Fase 1 | Substituído por |
|---|---|
| C-AUTH-05 | A-MW-03 |
| C-NAV-04 | A-BOOT-01 |
| C-DB-04 (MANUAL) | A-DB-09 (MANUAL) |
| C-DB-05 (MANUAL) | A-DB-06 (MANUAL) |

Qualquer outro teste da Fase 1 que quebrar durante a Fase 3 é regressão.

---

## 7. Entregáveis

- [ ] Este catálogo revisado, com as decisões da §3 fechadas
- [ ] Usuários e perfis da §4 no seed; helpers `loginAs` e de leitura de claims — usados só por quem executa o checklist MANUAL, nunca pela suíte automatizada
- [ ] Arquivos de teste com os `it.todo` de todos os A-xx das camadas UNIT/E2E, sem asserções
- [ ] Checklist MANUAL (markdown ou planilha) com os A-DB-xx e A-TEN-01, sem execução ainda
- [ ] Lista de migrations da Fase 3 com o nome e o par de rollback de cada uma

---

## 8. Critérios de saída

- [ ] Catálogo aprovado por pelo menos um revisor além do autor
- [ ] Decisões 3.1 a 3.7 registradas
- [ ] Q7 respondida (ou A-DB-11/A-TEN-01 mantidos como detectores de N3)
- [ ] `it.todo` presentes e listados no relatório do Vitest (casos UNIT) e `test.fixme` no relatório do Playwright (casos E2E)
- [ ] Checklist MANUAL redigido e revisado junto com o catálogo

**Estimativa:** 4–6 h.
