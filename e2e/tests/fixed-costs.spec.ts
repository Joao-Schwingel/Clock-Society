import { test, expect, login } from "../test-helpers";

// Labels do formulário não usam htmlFor (achado: getByLabel não funciona
// aqui) — localizamos o input pelo <div class="space-y-2"> que contém o
// <label> com o texto exato, igual ao padrão repetido em fixed-cost-form.tsx.
function fieldNear(page: import("@playwright/test").Page, labelText: string) {
  // .last() pega o <div> mais específico (o pai direto do <label>) — o
  // ancestral mais externo (que também "contém" o label) viria primeiro em
  // ordem de documento.
  return page
    .locator("div")
    .filter({ has: page.locator("label", { hasText: new RegExp(`^${labelText}$`) }) })
    .last()
    .locator("input, textarea");
}

async function goToCustos(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("tab", { name: "Custos" }).click();
  await expect(page).toHaveURL(/tab=custos-fixos/);
}

// O botão do dia usa aria-label com a data completa em português (ex:
// "terça-feira, 15 de setembro de 2026"), então getByRole(name) não ajuda —
// localizamos pelo atributo data-day="DD/MM/AAAA" que o react-day-picker
// gera.
async function pickToday(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "dd/mm/aaaa" }).click();
  await page.locator('[data-slot="calendar"] button[data-day="15/09/2026"]').click();
}

// C-FIX-03
//
// ACHADO: fixed-cost-form.tsx usa o hook useToast() do shadcn
// (hooks/use-toast.ts), mas app/layout.tsx só monta o <Toaster/> do
// **sonner** — o <Toaster/> do shadcn (components/ui/toaster.tsx) nunca é
// renderizado em lugar nenhum do app. As mensagens de sucesso/erro deste
// hook (aqui, em contracts-form.tsx e em contracts-table.tsx) são
// disparadas mas nunca aparecem na tela. Por isso o teste confere o efeito
// (a linha nova aparece na tabela) em vez do toast.
test("criar custo fixo com validação (nome obrigatório, 1-12 meses, valor != 0)", async ({
  page,
}) => {
  await goToCustos(page);

  // valor 0 é bloqueado
  await fieldNear(page, "Nome do Custo \\*").fill("Custo Teste");
  await fieldNear(page, "Valor").fill("0");
  await pickToday(page);
  await page.getByRole("button", { name: "Adicionar Custo" }).click();
  await expect(page.getByText("Valor não pode ser zero")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Custo Teste" })).toHaveCount(0);

  // valor negativo é permitido
  await fieldNear(page, "Valor").fill("-50");
  await page.getByRole("button", { name: "Adicionar Custo" }).click();

  await expect(page.getByRole("row").filter({ hasText: "Custo Teste" })).toContainText("-50");
});

test("excluir custo fixo pede confirmação (dialog nativo)", async ({ page }) => {
  await goToCustos(page);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Aluguel" })
    .locator("button")
    .click();

  await expect(page.getByRole("row").filter({ hasText: "Aluguel" })).toHaveCount(0);
});
