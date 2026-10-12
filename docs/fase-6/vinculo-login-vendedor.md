# Vínculo login ↔ vendedor — diagnóstico e opções

> Investigação de 09/10/2026, feita contra o **clone local de produção** e contra um Postgres
> descartável com as migrations do repo. Não é decisão tomada: é o material para decidir.
>
> Evidência automatizada: `pnpm db:test:vinculo` (19 casos de banco) e `lib/users/service.test.ts`
> (22 casos de serviço).

## 1. Resumo

Três coisas distintas apareceram na investigação, em ordem de urgência:

| # | O quê | Gravidade |
|---|---|---|
| **A** | **Criar usuário não funciona** — nem local, nem em produção quando a Fase 6 subir. Causa raiz identificada | Bloqueador |
| **B** | Depois de criado, **não existe nenhuma forma de alterar o vínculo** | Limitação de fluxo |
| **C** | O modelo usa tabela de junção (N:N) para uma relação que é 1:N, e nada representa "a mesma pessoa" | Dívida de modelagem |

O **A** é bug e precisa de correção. O **B** e o **C** são a conversa de fluxo — as opções estão na §5.

---

## 2. Como funciona hoje

### Modelo

```
auth.users ──1:1── profiles ──1:N── profile_salespersons ──N:1── salespersons ──N:1── companies
                   (login)          (tabela de junção)           (registro de            (empresa)
                                                                  vendedor)
```

- `salespersons` tem `company_id`: **cada registro pertence a uma empresa só**. "A mesma pessoa em
  duas empresas" são, necessariamente, **dois registros**.
- `profile_salespersons` tem PK `(profile_id, salesperson_id)`: um login carrega **N** registros.
- `unique (salesperson_id)`: um registro pertence a **no máximo um** login
  (`013_create_profiles.sql:23`, caso A-DB-14).

Ou seja: **um login para vários registros, sim; um registro para vários logins, não.** Isso era
intencional desde a Fase 5 — o fixture previa `vend-ab@t1` → "Carla (A) + Carla (B)", descrito como
"Multiempresa e seletor", e a área do vendedor tem seletor de empresa por causa disso.

### O que o banco garante (verificado)

`pnpm db:test:vinculo` sobe um Postgres descartável, aplica as migrations na ordem real
(base → Fase 3 → `019`, `020`, `016`), semeia dados sintéticos e comprova:

| Caso | Regra |
|---|---|
| V-LINK-01/02 | conta com dois registros em empresas diferentes → **aceito** |
| V-LINK-03 | um registro em dois logins → **bloqueado** (`unique`) |
| V-LINK-04 | par repetido → bloqueado (PK) |
| V-LINK-05 | vendedor de **outro inquilino** → o banco **aceita** (lacuna; só o serviço barra) |
| V-LINK-06 | dois registros da **mesma** empresa no mesmo login → aceito (provavelmente não desejado) |
| V-LINK-07/08/09/10 | `my_salesperson_ids()`, `my_company_ids()` e `vendor_sales` respeitam o multiempresa |
| V-LINK-11/12 | `commission_summary()`: comissão própria vem; a do colega vem nula; custos descontados |
| V-LINK-13/14 | nem vendedor nem admin escrevem o vínculo pelo cliente — só a chave de serviço |
| V-LINK-15 | perfil desativado não enxerga vínculo nenhum |
| V-LINK-16/17/18 | vendedor com vendas não se apaga; sem vendas, o vínculo cai junto; apagar o perfil limpa tudo |

### Fluxo na tela (hoje)

**Usuários → Novo usuário**, papel "vendedor":

1. multisseleção dos registros existentes, mostrados como `Nome (Empresa)` — registros já vinculados
   a outro login não aparecem;
2. opcionalmente, **um** registro novo: nome + **uma** empresa;
3. aviso quando o registro escolhido não tem vendas.

Depois de criado, a edição (`PATCH /api/users/[id]`) só aceita `full_name`, `is_active` e
`reset_password` (`lib/users/schemas.ts:31`). **Vínculo não entra.**

---

## 3. (A) Por que não dá para criar usuário — causa raiz

Reproduzido no clone local e isolado em dois experimentos.

**Sintoma:** a tela mostra "Não foi possível criar o usuário." e o log do Auth registra, no mesmo
segundo, a criação e a remoção:

```
POST   /admin/users              → 200   user_signedup
DELETE /admin/users/aafabe50-…   → 200   user_deleted
```

Isso é a compensação do `createUser` (`lib/users/service.ts`) desfazendo o login após uma falha
posterior.

**Passo a passo reproduzido com a chave de serviço local:**

```
1) POST /admin/users               → 200, usuário criado
   raw_app_meta_data               → {"app_role":"vendedor","tenant_id":"cf6471…", "provider":"email", …}
2) gatilho criou o perfil?         → NÃO
3) PATCH /profiles?id=eq.<novo>    → 200 []          (zero linhas, sem erro)
4) POST /profile_salespersons      → 409 código 23503
   "Key (profile_id)=(…) is not present in table \"profiles\""
```

**Causa:** `on_auth_user_created` é `AFTER INSERT ON auth.users` e só cria o perfil se o
`raw_app_meta_data` já tiver `app_role` e `tenant_id` **no momento do INSERT**. O GoTrue, no
`admin.createUser`, grava o usuário primeiro e aplica o `app_metadata` **depois**, num UPDATE. O
gatilho não vê o UPDATE, o perfil nunca nasce, e o vínculo quebra na chave estrangeira.

Comprovado isolando o gatilho (insert direto em `auth.users`):

| Experimento | Perfil criado? |
|---|---|
| INSERT **com** `app_role`/`tenant_id` no `raw_app_meta_data` | **SIM** |
| INSERT sem eles, `app_metadata` chegando depois por UPDATE | **NÃO** |

O gatilho está certo e habilitado; o que não vale é a **premissa** de que o `app_metadata` chega no
INSERT. Os testes de unidade não pegam isso porque o repositório em memória cria o perfil dentro do
`createAuthUser` — ou seja, o *fake* simula um gatilho que, no GoTrue real, não dispara.

**Isto não é problema do ambiente local.** Vai acontecer igual em produção assim que a Fase 6 subir:
hoje `/api/users` não consegue criar nenhum usuário.

### Correção aplicada (A1 + A2)

| Opção | Prós | Contras |
|---|---|---|
| **A1.** Gatilho também em `UPDATE OF raw_app_meta_data` | Uma linha de migration; conserta qualquer caminho que crie usuário (inclusive o painel do Supabase) | Dispara em toda alteração de metadados; precisa continuar idempotente (o `on conflict do nothing` já cobre) |
| **A2.** O repositório cria o perfil explicitamente após `createAuthUser` (upsert) | Determinístico, sem depender de gatilho; o erro aparece na hora, no `catch` certo | Duplica a regra que já está no gatilho; dois caminhos para manter |

As duas foram feitas: A1 porque o gatilho era uma armadilha silenciosa para **qualquer** forma de
criar usuário; A2 porque a API não deve depender de efeito colateral para cumprir o próprio
contrato — e é ela que faz a criação funcionar mesmo sem a migration.

- `scripts/021_fix_profile_trigger.sql` (+ rollback) — gatilho em `insert or update of raw_app_meta_data`.
- `UsersRepo.ensureProfile()` (`lib/users/repo.ts`, `supabase-repo.ts`) — upsert do perfil, chamado
  por `createUser` logo após `createAuthUser` e antes do vínculo.
- Os três `catch` de `lib/users/service.ts` agora registram o erro original com `console.error`.
  Sem isso, a falha era invisível: o login criado some na compensação e a tela só diz "Não foi
  possível criar o usuário."
- O repositório em memória dos testes passou a **não** criar o perfil dentro de `createAuthUser`
  (como o GoTrue), e `linkSalespersons` passou a recusar perfil inexistente (como a FK). Era essa
  diferença entre o *fake* e a realidade que deixava a suíte verde com o produto quebrado.

Verificado contra o Supabase local, com usuário de teste criado e apagado:
`createAuthUser → 200`, `ensureProfile → 201`, `linkSalespersons → 201`, perfil = 1, vínculo = 1.

---

## 4. (B e C) Limitações do fluxo atual

1. **Vínculo é imutável depois da criação.** Se a pessoa passa a atender uma segunda empresa, ou
   deixa de atender uma, não há tela nem endpoint. Só mexendo no banco.
2. **Criação inline cobre uma empresa só.** `new_salesperson` é um objeto, não uma lista. Para a
   mesma pessoa em duas empresas, os dois registros precisam **já existir**.
3. **Nada liga os dois registros como "a mesma pessoa".** O nome é texto livre: "Carla" na empresa A
   e "Carla" na B são independentes. Não há relatório consolidado por pessoa, e duas grafias
   diferentes passam despercebidas.
4. **Dois registros da mesma empresa no mesmo login são aceitos** (V-LINK-06), no banco e na tela.
   Se isso é duplicidade de cadastro, falta barrar.
5. **O registro "Site" é selecionável.** O gatilho da `009` cria um "Site" por empresa; ele aparece
   na lista e pode ser vinculado a um login, que passaria a ver todas as vendas do site.
6. **Sem defesa de inquilino no banco** (V-LINK-05): a tabela de junção não tem constraint de
   inquilino; quem barra é `salespersonIdsInTenant()`. Como só a chave de serviço escreve ali, o
   risco prático é baixo, mas é a única regra do vínculo sem defesa no banco.
7. **Tabela de junção para uma relação 1:N.** `profile_salespersons` é a forma canônica de N:N, mas
   o `unique (salesperson_id)` a rebaixa a 1:N. A forma canônica de 1:N é uma coluna no lado N.

---

## 5. Opções de fluxo, com prós e contras

As opções **não** são excludentes: B1 e B2 são sobre *onde e quando* se edita o vínculo; C1 e C2 são
sobre *como* ele é modelado. Dá para fazer só as de fluxo e deixar a modelagem como está.

### B1 — Editar vínculo na tela de Usuários (`PATCH /api/users/[id]`)

Acrescentar `salesperson_ids` ao contrato de edição: adiciona e remove vínculos do login.

**Prós**
- Resolve o problema real: o vínculo muda ao longo do tempo, não só na criação.
- Reaproveita as validações que já existem (`salespersonIdsInTenant`, `linkedSalespersonIds`).
- A tela de Usuários vira o único lugar onde se gerencia acesso — coerente com a permissão `users.manage`.
- Mudança pequena: schema, serviço, repositório e um bloco na tela de edição.

**Contras**
- Remover vínculo tira acesso na hora; vale confirmação explícita ("o vendedor deixa de ver as vendas de X").
- Sem trilha de auditoria, ninguém sabe quem desvinculou e quando.
- Não resolve a criação inline em várias empresas (precisa de B3 ou dos registros já existirem).

### B2 — Vincular a partir da tela de Vendedores (Configurações)

Em **Configurações → Vendedores**, cada registro ganha "vincular a um login". A tela de Usuários só
cria a conta.

**Prós**
- Você vincula onde já está cadastrando a pessoa — e é lá que o registro nasce.
- Combina com o modelo: o vínculo é propriedade do **registro** (um registro, um login), não do login.
- A tela já sabe quais registros têm login (`settings-modal.tsx:54` já carrega isso).
- Resolve "pessoa passou a atender outra empresa" sem passar pela tela de Usuários.

**Contras**
- A tarefa "criar vendedor com login" fica em duas telas.
- Dois lugares mexendo na mesma relação, se B1 também existir.
- Precisa de permissão própria: hoje quem mexe em vendedores não é necessariamente quem gerencia usuários.

### B3 — `new_salesperson` vira lista

Permitir criar N registros (um por empresa) na criação do usuário.

**Prós**
- Resolve exatamente o caso que você levantou, no momento em que ele aparece.
- Mudança mínima: zod, serviço e um repetidor no formulário.

**Contras**
- Não resolve nada depois da criação — o buraco principal continua.
- Formulário mais pesado, e mais caminhos para criar registro duplicado.
- Só adia B1/B2.

### C1 — Trocar a junção por `salespersons.profile_id`

Uma coluna no registro de vendedor, com `unique` implícito pela natureza 1:N, e FK para `profiles`.

**Prós**
- Modelagem correta para 1:N; a regra "um registro, um login" vira a própria estrutura.
- Menos uma tabela, menos um join em `my_salesperson_ids()`, `vendor_can_see_sale()` e nas policies.
- **Fecha a lacuna de inquilino de graça**: `salespersons` já tem `user_id`, então dá para exigir no
  banco que o perfil seja do mesmo inquilino (constraint ou gatilho simples).
- O vínculo passa a ser editável onde o vendedor é editado (casa com B2).

**Contras**
- Migration com movimentação de dados e reescrita das funções da `020`/`016` — e a `020` nem subiu
  em produção ainda, então é o momento mais barato para fazer.
- Toca policies que já foram testadas; exige repetir os checklists V-DB.
- Perde-se o `created_at` do vínculo (hoje existe, embora não usado).

### Onde mora o percentual de comissão (medido em 11/10/2026)

Importa para qualquer mudança de modelo, e é contraintuitivo: **o percentual é da venda, não do
cadastro**. `salespersons.commission_percentage` é resquício do modelo antigo.

- Nenhum cálculo lê `salespersons.commission_percentage`. Quem calcula —
  `commission_summary()` (`016`), `lib/calc/dashboard.ts:85`, a tabela de vendas e o CSV — usa
  `sale_salespersons.commission_percent`.
- Ao adicionar um vendedor numa venda, o formulário começa com **0** e o admin digita
  (`sales-form.tsx:118`). O cadastro não serve nem de valor padrão.
- O único lugar que lê o campo é o formulário de Configurações → Vendedores, que o exibe para
  edição. O `/api/users` cria registro novo com `0`.
- Nos dados reais: **188 de 754** linhas de `sale_salespersons` têm percentual diferente do
  cadastro, e a mesma pessoa aparece com vários — Leonardo Risso com 0/2/3/5/7/10/45%.

Consequência: **fundir registros de vendedor não mexe em comissão nenhuma**, porque a comissão vive
em `sale_salespersons`, que não muda de forma.

### C2 — Entidade "pessoa"

`people` (nome, documento), `salespersons.person_id`, `profiles.person_id`.

**Prós**
- Modela o que você descreveu: *a mesma pessoa* em empresas diferentes, explicitamente.
- Abre relatório consolidado por pessoa (comissão total somando empresas).
- Vincular login vira "escolher a pessoa" — e todos os registros dela entram juntos, automaticamente.
- Resolve a duplicidade de nome e o caso do "Site" (que não é pessoa).

**Contras**
- A maior mudança das cinco: migration, deduplicação dos 18 registros atuais, telas novas.
- Mais um conceito para o usuário final entender.
- Resolve um problema que, com 3 empresas e 18 registros, ainda é pequeno.

---

## 5b. O que foi implementado (11/10/2026)

Decisão tomada: **C1 + C2 simplificada** — o cadastro passa a ser da PESSOA, com os acessos por
empresa numa tabela própria, e o login 1:1 com a pessoa. O gatilho que destrava isso é o achado de
que o percentual mora na venda (seção acima): fundir cadastros não mexe em comissão nenhuma.

| Antes | Depois |
|---|---|
| `salespersons (id, company_id, commission_percentage, …)` — um por (pessoa, empresa) | `salespersons (id, name, is_active, profile_id)` — um por pessoa |
| — | `salesperson_companies (salesperson_id, company_id, is_active)` — os acessos |
| `profile_salespersons` — login N registros | `salespersons.profile_id` único — login 1 pessoa |

- Migration `022_vendedor_por_pessoa.sql` + rollback. Funde por `(inquilino, nome normalizado)`,
  guarda tudo em `salespersons_merge_map` e **aborta** se alguma das três condições de segurança
  não valer (duas pessoas iguais na mesma venda, vínculo cruzando empresas, login apontando para
  duas pessoas).
- Funções atualizadas: `my_salesperson_ids()` (pelo `profile_id`), `my_company_ids()` (pelos
  acessos), `commission_summary()` (recorte de empresa pelo acesso) e o gatilho do "Site" (uma
  pessoa "Site" por inquilino, com acesso a cada empresa).
- App: Configurações → Vendedores cadastra a pessoa e marca as empresas; a tela de Usuários
  escolhe **uma** pessoa (ou cria a pessoa já com várias empresas); `/api/users` com
  `salesperson_id` e `new_salesperson.company_ids`.
- O percentual saiu do cadastro. Ele nunca foi usado em cálculo e seguia divergindo da venda.

**Prova de que o histórico não muda:** `pnpm db:test:vinculo` tira a foto de `commission_summary()`
por empresa ANTES da 022, aplica, e exige foto idêntica depois (M-01/M-02), confere
`sale_salespersons` intacto (M-03) e ainda ensaia o rollback de volta aos números originais
(M-22/23/24). O oráculo independente da Fase 1 (`lib/calc/commission-summary-oracle.test.ts`)
continua batendo com os fixtures migrados.

**Fica em aberto:** trocar o login de uma pessoa depois de criado ainda exige banco (o `PATCH
/api/users/[id]` segue sem mexer em vínculo) — mas as empresas da pessoa agora se editam em
Configurações, que era o caso que doía. E a lacuna de inquilino na tabela de acessos (M-12)
continua: quem barra é o serviço.

## 6. Recomendação

1. ~~**Agora:** corrigir o (A).~~ **Feito** (§3). Falta aplicar a `021` nos ambientes: no clone
   local e, no deploy da Fase 6, em produção — pelo runbook, à mão. A criação pela tela já funciona
   sem ela (o `ensureProfile` resolve o caminho da API); a `021` cobre os outros caminhos.
2. **Em seguida:** **B1** (editar vínculo na tela de Usuários). É o menor passo que resolve o
   problema de verdade, e dispensa o B3: com edição, criar com uma empresa e somar a segunda depois
   deixa de ser um beco sem saída.
3. **Decidir conscientemente:** **C1**, enquanto a `020`/`016` ainda não estão em produção. Depois
   que subirem, a mesma mudança custa muito mais. Se a resposta for "não", vale pelo menos fechar a
   lacuna de inquilino (V-LINK-05) com um gatilho na tabela de junção.
4. **Deixar para depois:** C2 e B2, a menos que apareça a necessidade de relatório por pessoa.
5. **Decisões pequenas pendentes:** bloquear dois registros da mesma empresa no mesmo login
   (V-LINK-06)? Esconder o "Site" da lista de vínculo?

## 7. Como revalidar

```bash
pnpm db:test:vinculo                      # 19 casos de banco, Postgres descartável
pnpm vitest run lib/users/service.test.ts # 22 casos do serviço
```

Depois de mexer no gatilho, refazer o experimento do §3 contra o clone: criar um usuário pela tela e
conferir que `profiles` e `profile_salespersons` ganharam a linha, sem `DELETE /admin/users` no log
do Auth (`docker logs supabase_auth_Clock-Society --tail 20`).
