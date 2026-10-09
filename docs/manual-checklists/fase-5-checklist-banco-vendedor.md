# Checklist MANUAL — Banco, papel vendedor (Fase 5 → executado na Fase 6)

> **Nunca automatizado. Nunca executado por um agente de IA. Nunca contra produção.**
> Executado à mão, por um humano, contra o Supabase **local** (descartável) ou de **homologação**,
> antes do merge/deploy das fatias 6.2 e 6.3. Não bloqueia o CI; bloqueia a saída da fatia.
> Spec: [`fase-5-casos-de-teste-vendedor.md`](../../specs/release-2/fase-5-casos-de-teste-vendedor.md) §5.
>
> **Status: redigido na Fase 5, ainda não executado.** Itens marcados **#13** dependem das decisões
> da issue #13; itens marcados **#9** dependem da issue #9 (pré-requisito da Fase 6).

## Antes de começar

1. Mesmo ambiente do ensaio da Fase 3 (`docs/fase-3/ensaio-local.md`), com as migrations da Fase 3
   aplicadas **e** as da Fase 6: `019_fix_missing_rls.sql` (a correção da #9), `020_vendor_policies.sql` e
   `016_vendor_views.sql`.
2. Rode o seed (`scripts/manual/fase-2/seed-usuarios.mjs`). Ele cria os logins `vend-*` e lista os
   vínculos esperados; faça cada vínculo à mão, com o id real do registro de vendedor:
   ```sql
   insert into public.profile_salespersons (profile_id, salesperson_id)
   values ('<profile_id do seed>', '<id real em salespersons>');
   ```
3. Escolha uma **venda compartilhada** entre os vendedores ligados a `vend-a` e `vend-b` e anote o id
   (`VENDA_COMP`). Anote também as contagens esperadas para `vend-a`:
   ```sql
   select count(*) from sales s
   where exists (select 1 from sale_salespersons ss
                 where ss.sale_id = s.id and ss.salesperson_id in (<ids dos vendedores de vend-a>));
   ```

### Como simular o vendedor

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<profile_id>","role":"authenticated","app_metadata":{"app_role":"vendedor","tenant_id":"<id do admin>"}}';
-- consultas do item
rollback;
```

Para o caminho real (PostgREST + token do hook): `node scripts/manual/fase-2/login-as.mjs vend-a@t1.test`.

---

## Fatia 6.2 — políticas do vendedor (`019_fix_missing_rls.sql` da #9 + `020_vendor_policies.sql`)

### V-DB-01 — `sales`: só as vendas em que consta

- [ ] `vend-a` lê exatamente a contagem anotada no passo 3
- [ ] `VENDA_COMP` aparece para `vend-a` **e** para `vend-b`

### V-DB-02 — `sale_items` e `sale_salespersons`

- [ ] `sale_items`: só itens das vendas do vendedor
- [ ] `sale_salespersons`: só as **próprias linhas** (ver V-DB-17)

### V-DB-03 — `sale_costs` (#13, 3.9)

- [ ] Lê os custos **só** das vendas em que consta (para o detalhe da venda)
- [ ] 0 linhas das vendas em que não consta
- [ ] `insert`/`update`/`delete` negados

### V-DB-04 — `companies` e `salespersons`

- [ ] `vend-ab` vê as 2 empresas em que atua; `vend-a` vê só a dele
- [ ] `salespersons`: só os registros do próprio vendedor

### V-DB-05 — `inventory`

- [ ] Todas as colunas, **inclusive** `unit_cost` e `total_value`, das empresas em que atua
- [ ] 0 linhas das demais empresas

### V-DB-06 — `costs`, `fixed_costs`, `contracts`

- [ ] 0 linhas em cada uma

### V-DB-07 — Escrita negada

Dentro de `begin … rollback`, como `vend-a`:

- [ ] `insert`, `update` e `delete` negados em `sales` (inclusive numa venda dele), `sale_items`,
      `sale_salespersons`, `sale_costs`, `inventory`, `salespersons`, `companies`, `fixed_costs`,
      `contracts`, `costs`

### V-DB-08 — Views antigas

- [ ] `sales_with_details`: 0 linhas para o vendedor (decisão 3.4, #13)
- [ ] `sales_with_salespersons`: conforme 3.4; **em nenhum caso com custo**

### V-DB-13 — Token do vendedor

- [ ] `login-as.mjs vend-a@t1.test` → `app_role = vendedor`, `tenant_id` = id do admin
- [ ] `login-as.mjs vend-troca@t1.test` → `must_change_password = true` nas claims (decisão 3.6)

### V-DB-14 — Perfil desativado

- [ ] `vend-inativo`: token sem `app_role`; 0 linhas em tudo; RPC negada
- [ ] Login de `vend-inativo` recusado pelo Auth (ban, decisão 3.7)

### V-DB-15 — Vendedor não altera permissões

- [ ] `update profiles set role = 'admin' where id = <próprio>` → negado
- [ ] `insert`/`delete` em `profile_salespersons` e em `role_permissions` → negados

### V-DB-16 — Vendedor sem vínculo

- [ ] `vendedor-sem-vinculo`: 0 linhas em todas as tabelas e views (A-DB-08 continua valendo)

### V-DB-17 — Comissão do colega (#9)

- [ ] Como `vend-a`, `select * from sale_salespersons where sale_id = 'VENDA_COMP'` → **só a linha
      de `vend-a`**; a linha de `vend-b` e o `commission_percent` dele não aparecem
- [ ] O mesmo pela API REST (`/rest/v1/sale_salespersons?sale_id=eq.…` com o token de `vend-a`)
- [ ] O mesmo pelas views e pela RPC: nenhum percentual do colega (na `vendor_sales` aparece só o nome)

### V-DB-19 — Sem recursão de RLS (020)

Rode o bloco de contagens do ensaio da Fase 3 (10 tabelas + 2 views) **duas vezes**: simulando o
admin e simulando `vend-a`.

- [ ] Nenhum erro `infinite recursion detected in policy for relation …`
- [ ] Como admin, as contagens são **as mesmas de antes da 019/020** (A-DB-04 continua valendo)

### V-DB-18 — Admin nunca é desativado (020)

Como `postgres` (que ignora RLS, como a chave de serviço), dentro de `begin … rollback`:

```sql
begin;
update public.profiles set is_active = false where id = '<id do admin>';   -- esperado: ERRO 23514
rollback;
begin;
update public.profiles set is_active = false where id = '<profile_id de vend-a>'; -- esperado: OK
rollback;
```

- [ ] Admin: erro `23514` (`profiles_admin_always_active`)
- [ ] Vendedor: atualização aceita

---

## Fatia 6.3 — `vendor_sales` e `commission_summary()` (`016_vendor_views.sql`)

### V-DB-09 — `vendor_sales`

- [ ] Só as vendas do vendedor
- [ ] Sem custo, margem ou líquido
- [ ] `salespersons` de `VENDA_COMP`: nomes de `vend-a` e `vend-b`; o % só do próprio, o do colega nulo (#13, 3.1)

### V-DB-10 — `commission_summary` numa empresa em que atua

- [ ] Como vendedor: vendas, custo e lucro líquido iguais aos do admin; **comissão dos colegas nula**,
      a própria preenchida; o vendedor inativo **não** aparece (#13)
- [ ] Como admin: o vendedor inativo com venda no período aparece, com `is_active = false`
- [ ] Uma linha por vendedor da empresa
- [ ] Exatamente 8 colunas: as 7 da §4.4 do planejamento + `is_active` (sem id de venda, cliente ou produto)

### V-DB-11 — `commission_summary` fora do escopo

- [ ] Empresa em que o vendedor não atua → `42501`
- [ ] Admin de outro inquilino (`outro@t2`) → `42501`

### V-DB-12 — Números da RPC (#13)

- [ ] Reproduz os números do Dashboard de hoje (C-DASH-04) em cada período testado, com as regras
      de Q2 e Q10 decididas na #13. Comparar com o retrato tirado antes da Fase 6.
- [ ] Com `p_months` nulo, soma todos os anos (como o Dashboard sem mês marcado, até a #13)
- [ ] Vendedor inativo com venda no período: aparece com `is_active = false` e entra no total (N12)
- [ ] Sem arredondamento: um percentual que gera 3+ casas devolve as 3+ casas (N13)

---

## Registro de execução

| Data | Fatia | Ambiente | Executado por | Itens OK | Itens com falha | PR |
|---|---|---|---|---|---|---|
| | | | | | | |
