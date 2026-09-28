# Checklist MANUAL — Banco (Fase 1)

> **Nunca automatizado. Nunca executado por um agente de IA.** Este checklist é
> executado à mão, por um humano, contra o Supabase **local** ou de
> **homologação** — nunca contra produção. Nenhum comando aqui é rodado pelo
> Claude Code: as permissões deste repositório (`.claude/settings.json`)
> bloqueiam comandos destrutivos de banco, e este documento é a contrapartida
> funcional a essa restrição (spec [`fase-1-rede-de-testes.md`](../../specs/release-2/fase-1-rede-de-testes.md) §2, §7, §9, §12).
>
> Cobre os casos C-DB-01..06, C-FIX-04 e C-SET-02, que não têm — e não vão
> ter — teste automatizado nesta release.

## Antes de começar

1. Confirme contra qual ambiente você vai rodar: **Supabase local** (via CLI,
   descartável) ou **homologação**. Nunca produção.
2. Carregue um conjunto de dados de teste equivalente ao fixture descrito em
   [`e2e/fixtures/`](../../e2e/fixtures) (os mesmos cenários: vendedor
   inativo com venda concluída, venda compartilhada entre 2 vendedores,
   custo fixo atravessando o ano, etc. — ver a tabela do item 4 da spec).
   O fixture é JSON (não é seed SQL) porque nenhuma automação deste
   repositório pode inserir dados em um banco; a montagem dos dados de teste
   no seu ambiente local/homologação é sua, manual, fora desta automação.
3. Anote a data, o ambiente e quem está executando no final deste
   documento.

## C-DB-01 — Contagens por tabela e view

Confira que as contagens batem com o que você carregou (uma linha por
tabela/view):

| Tabela/view | Contagem esperada | Contagem observada | OK? |
|---|---|---|---|
| `companies` | | | |
| `salespersons` | | | |
| `sales` | | | |
| `sale_items` | | | |
| `sale_salespersons` | | | |
| `sale_costs` | | | |
| `fixed_costs` | | | |
| `contracts` | | | |
| `inventory` | | | |
| `sales_with_details` (view) | = contagem de `sales` | | |
| `sales_with_salespersons` (view) | = contagem de `sales` | | |

```sql
select count(*) from public.companies;
select count(*) from public.salespersons;
-- repita para as demais tabelas e views
```

## C-DB-02 — CRUD em todas as tabelas que o front escreve

Pelo painel do Supabase ou `psql`, **como o dono** (usuário autenticado, dono
do inquilino de teste): crie, altere e exclua uma linha em cada uma destas
tabelas, confirmando que a operação funciona e que nenhuma política
inesperada bloqueia:

- [ ] `companies`
- [ ] `salespersons`
- [ ] `sales` (+ `sale_items`, `sale_salespersons`)
- [ ] `sale_costs`
- [ ] `fixed_costs`
- [ ] `contracts`
- [ ] `inventory`

## C-DB-03 — Isolamento entre inquilinos (dois usuários)

Com dois usuários de teste (T1 = dono, T2 = outro, como no fixture:
`admin@t1` / `outro@t2`), autenticados separadamente (duas sessões, dois
tokens):

- [ ] T2 **não lê** nenhuma linha de T1 em `companies`, `sales`,
  `salespersons`, `fixed_costs`, `contracts`, `inventory` (via
  `select * from ...` autenticado como T2).
- [ ] T2 **não escreve** (insert/update/delete) em nenhuma linha de T1
  (tentar e confirmar que a política nega, não que a linha simplesmente não
  aparece na busca).

## C-DB-04 — Acesso da chave anônima (sem login)

> **Substituído por A-DB-09 a partir da Fase 3** ([checklist da Fase 2](fase-2-checklist-banco-admin.md)).

Usando a chave `anon` (pública), **sem nenhum login**, tente ler cada tabela
e view listada em C-DB-01. Registre o que consegue ler:

| Tabela/view | anon consegue ler? | Registrado como falha conhecida? |
|---|---|---|
| ... | | |

> Hoje (achados 1–3 do planejamento), é esperado que haja acesso indevido —
> isso é um achado conhecido, não uma regressão desta fase. **Passa a valer
> (ou seja, deixa de ser aceitável) na Fase 3.**

## C-DB-05 — Isolamento nas views e em `sale_items`

> **Substituído por A-DB-06 a partir da Fase 3** ([checklist da Fase 2](fase-2-checklist-banco-admin.md)).

Como T2, tente ler `sales_with_details`, `sales_with_salespersons` e
`sale_items` e confirme se linhas de T1 aparecem.

- [ ] `sales_with_details` — isolado?
- [ ] `sales_with_salespersons` — isolado?
- [ ] `sale_items` — isolado?

> Mesma nota de C-DB-04: hoje é esperado falhar (achados 1–3). **Passa a
> valer na Fase 3.**

## C-DB-06 — Efeito real do gatilho `recalc_sale_total` (N1)

Relacionado a C-SALES-08 (E2E, mockado — não exercita gatilho nenhum):

1. Crie uma venda com 2 itens (quantidade × preço unitário) pelo painel/SQL
   direto (não pela UI).
2. Registre o `total_price` inserido manualmente.
3. Se existir um gatilho `recalc_sale_total` na tabela `sale_items` ou
   `sales` no seu ambiente, confirme se ele **sobrescreve** `total_price`
   com `sum(quantity × unit_price)` dos itens.
4. Repita editando os itens de uma venda existente pela **UI real** (tela de
   Nova Venda/Editar Venda) e comparando o "Valor Líquido Total" digitado
   com o valor que fica salvo no banco depois.

Resultado observado: ______________________________________________

## C-FIX-04 — `end_date` de `fixed_costs` preenchido por gatilho

1. Insira um `fixed_costs` com `start_date` e `qtdmonths` definidos, **sem**
   informar `end_date`.
2. Confirme se `end_date` foi preenchido automaticamente (por gatilho) e se
   o valor bate com `start_date + qtdmonths` meses.

Resultado observado: ______________________________________________

## C-SET-02 — Criar empresa cria o vendedor "Site"

1. Insira uma nova linha em `companies` (pelo painel/SQL, não pela UI — a
   UI não tem uma tela dedicada de "criar empresa").
2. Confirme se um vendedor chamado "Site" foi criado automaticamente em
   `salespersons` para essa empresa (gatilho).

Resultado observado: ______________________________________________

## Registro de execução

| Data | Ambiente (local/homologação) | Executado por | Resultado geral |
|---|---|---|---|
| | | | |

**Critério de saída da Fase 1 (spec §9):** todos os itens acima executados
pelo menos uma vez, com resultado registrado por escrito. Isso não bloqueia
o CI, mas bloqueia a saída desta fase e das fases que dependem de política
de banco (Fase 3 em diante).
