# Fase 4 — Teste manual do admin (portão)

**Objetivo:** confirmar, com dados reais e olhos humanos, que o admin não perdeu nada com a Fase 3, e autorizar o início da Fase 5.
**Depende de:** Fase 3 concluída; Q3 resolvida (projeto de homologação). **Libera:** Fase 5.

---

## 1. Pré-requisitos

- [ ] Runbook, rollbacks e *redeploy* do app revisados (Fase 3 §4)
- [ ] Projeto de homologação com schema igual ao de produção (baseline da Fase 1) e o fixture carregado
- [ ] Script de retrato de produção pronto (Fase 1 §6)
- [ ] Local fora do repositório definido para guardar o retrato e as evidências (D-11)

---

## 2. Etapa A — Homologação

- [ ] Aplicar o runbook na ordem, inclusive a habilitação do hook e o fechamento do auto-cadastro
- [ ] Executar o checklist **MANUAL** de banco (Fase 1 §7 "Banco"; Fase 2 §5 `A-DB-xx`/`A-TEN-01`) contra a homologação, com resultado registrado
- [ ] Rodar a suíte E2E (mockada) normalmente contra a homologação, como checagem extra de regressão visual — ela não depende do banco de homologação, já que não toca banco nenhum; os números esperados da Fase 1 continuam sendo o oráculo
- [ ] Executar o roteiro manual (§4)
- [ ] **Ensaiar o rollback completo**, confirmar que o sistema volta ao estado da Fase 1 e reaplicar

---

## 3. Etapa B — Produção

- [ ] Backup do banco imediatamente antes da janela
- [ ] Novo dump *schema-only*, comparado com a baseline (nada mudou por fora desde a Fase 1?)
- [ ] **Retrato "antes":** script + CSV de vendas de cada empresa
- [ ] Aplicar o runbook
- [ ] **Retrato "depois"** e comparação: devem ser idênticos
- [ ] Roteiro manual resumido: itens marcados com ★ na §4
- [ ] Gatilho de retorno: divergência de números não resolvida em 30 minutos → rollback (§9 do planejamento)

---

## 4. Roteiro manual

### Acesso

- [ ] ★ Login com o admin em sessão nova
- [ ] ★ Admin que já estava logado **antes** da janela continua usando o sistema sem cair em `/403` (A-MW-06)
- [ ] `/auth/sign-up` redireciona para o login
- [ ] ★ "Sair" encerra a sessão

### Navegação

- [ ] ★ Abas Clock Society, The Secret, Morfeus e Contratos, nessa ordem
- [ ] Subabas Dashboard, Vendas, Estoque e Custos; a URL acompanha e recarregar mantém a aba
- [ ] "Configurações" abre

### Dashboard (cada empresa)

- [ ] ★ Os 6 cartões iguais ao retrato em: ano inteiro, mês atual e um mês antigo
- [ ] Cartões por vendedor iguais ao retrato

### Vendas (cada empresa)

- [ ] ★ Cartões de concluídas, pendentes e pagamentos iguais ao retrato
- [ ] ★ CSV exportado sem filtro idêntico ao CSV "antes" (diff)
- [ ] Paginação, busca e cada filtro
- [ ] Criar, editar e excluir venda; confirmar pagamento; alternar status; detalhes com custo adicionado e removido — **em produção, só com uma venda de teste combinada com o cliente, ou apenas em homologação**

### Estoque, Custos, Contratos, Configurações

- [ ] ★ Cartões iguais ao retrato
- [ ] Criar, editar (onde houver) e excluir — mesma ressalva de produção

### Segurança, fora da interface

- [ ] Com a chave anônima, sem login: nenhuma tabela ou view retorna dados (A-DB-09)
- [ ] *(Homologação)* Login sem perfil → `/403`, e nenhuma consulta retorna dados
- [ ] *(Homologação)* Perfil `vendedor` sem vínculo → mesma coisa
- [ ] Auto-cadastro desabilitado no painel

### Desempenho percebido

- [ ] Telas carregam em tempo parecido com o de antes (comparar com o `explain analyze` da Fase 3)

---

## 5. Registro

Uma tabela por etapa (homologação e produção) com: item, resultado (OK / falhou / N/A), responsável,
data e evidência (print, diff do CSV). Evidências com dados reais ficam fora do repositório (D-11). No
PR da fase, só o resumo: quantos itens, quantos OK e as pendências.

---

## 6. Critérios de saída

- [ ] Todos os itens OK em homologação e em produção
- [ ] Retrato "depois" idêntico ao "antes"
- [ ] Nenhuma pendência aberta

A Fase 5 começa assim que a Etapa B termina. Recomenda-se um **período de observação** de cerca de 5
dias úteis de uso normal pelo admin em produção. Ele corre em paralelo à Fase 5 e só precisa terminar
antes da implantação da Fase 6.

**Estimativa:** 2–4 h, mais a janela de implantação.
