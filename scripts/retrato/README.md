# Retrato dos números de produção (Fase 1 §6)

> **Somente leitura. Executado manualmente, por um humano, nunca por este
> agente e nunca dentro do CI ou da suíte de testes.** Roda na Fase 4,
> imediatamente antes e imediatamente depois da janela de implantação, para
> comparar os números do sistema antes/depois de qualquer mudança (spec
> [`fase-1-rede-de-testes.md`](../../specs/release-2/fase-1-rede-de-testes.md) §6).

Substitui a "foto" manual do planejamento (§8.5) por um roteiro repetível.

## Como usar

1. Rode `retrato.sql` (abaixo) no SQL Editor do Supabase, com uma credencial
   **só de leitura** quando disponível (reforça por permissão do próprio
   banco que o roteiro não pode escrever nada).
2. Exporte o resultado (CSV) e guarde **fora do repositório** — o
   repositório é público, e os dados são financeiros e trazem nomes de
   clientes (D-11 do planejamento). Sugestão: uma pasta local ou um
   storage privado da equipe, nunca commitado.
3. Pela própria tela (aba Vendas de cada empresa, sem filtro), use o botão
   "Exportar" para baixar o CSV `vendas-AAAA-MM-DD.csv` de cada empresa.
   Guarde junto com o resultado do passo 2, também fora do repositório.
4. Repita os passos 1–3 imediatamente **antes** e imediatamente **depois**
   da janela de implantação da Fase 3/6, e faça um diff linha a linha dos
   CSVs e dos agregados. Qualquer divergência não explicada pela mudança
   pretendida é um bug a investigar antes de seguir.

## `retrato.sql`

Ver o arquivo [`retrato.sql`](./retrato.sql) neste diretório. Todas as
consultas são `select` puro — nenhuma tem `insert`/`update`/`delete`/`drop`.
