# Bugs conhecidos — Fase 1 (D-5)

> Achados durante a construção da rede de testes. Por regra da fase (§1:
> "nenhuma mudança de comportamento"), nenhum deles foi corrigido — cada um
> foi **fixado em teste** (a suíte trava o comportamento atual, certo ou
> errado) e registrado aqui. Corrigir é trabalho de uma release futura,
> salvo se algum vier a ser reclassificado como falha de segurança.

## 1. Corrida entre os dois `useTabWithQuery` na montagem inicial

**Onde:** `hooks/use-queryTab.ts`
**Caracterizado em:** `e2e/tests/nav.spec.ts`, comentário em `login()`
(`e2e/test-helpers.ts`)

Quando duas instâncias do hook montam juntas (a de `?company=` em
`DashboardLayout` e a de `?tab=` em `CompanyDashboard`, filho dela), cada
uma lê a mesma `searchParams` "stale" (do render anterior) e chama
`router.replace` a partir dela. Uma sobrescreve a outra. Efeitos observados:

- `?tab=dashboard` nunca aparece na URL na carga inicial — só depois da
  primeira troca de subaba.
- Trocar de empresa imediatamente após o login às vezes não atualiza
  `?company=` (a escrita da subaba, feita pelo `CompanyDashboard` recém
  montado da nova empresa, "ganha" da escrita da empresa).

**Impacto:** cosmético/URL, não achei efeito no dado exibido. Não afeta
segurança.

## 2. Auto-create de empresas quebra por Request Memoization do Next.js

**Onde:** `app/dashboard/page.tsx`
**Caracterizado em:** `e2e/tests/nav.spec.ts` (`test.fail(...)`, C-NAV-04)

O fluxo de primeiro acesso insere as 3 empresas e refaz a **mesma** consulta
(`select("*").eq("user_id", user.id).order("code")`) para buscar as linhas
recém-criadas. O React/Next.js memoiza chamadas `fetch` idênticas dentro do
mesmo render (Request Memoization); como `@supabase/supabase-js` não passa
`cache: "no-store"`, a segunda chamada recebe o resultado da primeira
(vazio, de antes do insert) em vez de bater o banco de novo. `newCompanies`
fica `[]`, e `DashboardLayout` quebra em `companies[0].code`.

Confirmado que não é artefato do mock: isolar uma 3ª consulta com um filtro
diferente no mesmo render retornou os dados novos corretamente — só
consultas com URL/opções **idênticas** são memoizadas.

**Impacto: provável bug de produção.** Como `@supabase/supabase-js` usa o
`fetch` global (o mesmo que o Next.js corrige em Server Components), o
mesmo problema deve acontecer contra o Supabase real, não só contra o mock
— quebrando a tela para **qualquer usuário novo sem empresas ainda**.
Recomendo priorizar a correção (ex.: usar `cache: "no-store"` na segunda
chamada, ou montar `newCompanies` a partir do retorno de
`.insert(...).select()` em vez de uma consulta separada) fora desta fase,
antes do próximo usuário novo se cadastrar.

## 3. `…` literal em atributos JSX (placeholder e texto de botão)

**Onde:** `components/dashboard/sales-table.tsx` (placeholder de busca;
texto do botão "Exportando…")
**Caracterizado em:** `e2e/tests/sales.spec.ts` (constante
`SEARCH_PLACEHOLDER`)

Dentro de uma string de atributo JSX (`placeholder="...…"`), `…`
não é interpretado como escape Unicode — isso só acontece em string
literals do JavaScript. O texto que chega na tela é literalmente
`...cliente…` (com a barra e "u2026" como caracteres), não
`...cliente…` com um "…" de verdade.

**Impacto:** cosmético (o placeholder e o texto do botão de exportar
mostram um `…` visível em vez de "…"). Correção trivial (usar o
caractere "…" direto ou `{"…"}` como expressão JS), mas fora do escopo
desta fase.

## 4. `<Toaster/>` do shadcn/ui nunca é montado

**Onde:** `hooks/use-toast.ts` + `components/ui/toaster.tsx` vs.
`app/layout.tsx`
**Caracterizado em:** `e2e/tests/fixed-costs.spec.ts`,
`e2e/tests/contracts.spec.ts` (comentários "ACHADO")

`fixed-cost-form.tsx`, `contracts-form.tsx` e `contracts-table.tsx` chamam
`toast({...})` do hook `useToast()` (shadcn/ui). `app/layout.tsx` só monta o
`<Toaster/>` do **sonner** (usado por `sales-view.tsx`/`sales-form.tsx`). O
`<Toaster/>` do shadcn/ui, que renderiza as mensagens do `useToast()`, não
está montado em lugar nenhum da árvore. Toda mensagem de sucesso/erro desses
três componentes é disparada mas nunca aparece na tela.

**Impacto:** usuário não recebe feedback visual ao criar/excluir custo fixo
ou contrato, nem quando algo dá erro nessas telas. Os testes E2E confirmam
o efeito (linha aparece/desaparece na tabela) e ignoram o toast.

## 5. Dívida de lint pré-existente (rebaixada para "warn")

**Onde:** `eslint.config.mjs` — ver o comentário no próprio arquivo
27 avisos (não erros) em código pré-existente, apontados pelas regras mais
novas do `eslint-plugin-react-hooks` bundladas pelo `eslint-config-next`
atual: `react-hooks/set-state-in-effect` (setState direto em `useEffect`,
padrão comum de data-fetching pré-React-Compiler), `react-hooks/immutability`
(inclui um caso de função usada antes de declarada em
`settings-modal.tsx`), `react-hooks/purity` (`Math.random()` durante o
render em `components/ui/sidebar.tsx`), `react/no-unescaped-entities`
(aspas literais em `settings-modal.tsx`). Nenhum foi corrigido nesta fase
(regra §1); ficam visíveis no `pnpm lint` como aviso, sem travar o CI.

## Componente órfão (não é bug, é código morto)

`components/dashboard/costs-view.tsx` (+ `costs-form.tsx`, `costs-table.tsx`)
não é importado por nenhum outro componente — não é alcançável pela UI.
Não recebeu teste nesta fase por não ser exercitável; considerar remover em
uma limpeza futura.
