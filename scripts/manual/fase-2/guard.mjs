// Trava comum dos helpers MANUAIS da Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §4, §7).
//
// Estes scripts abrem conexão com um Supabase de verdade. Por isso:
// - nunca rodam em CI nem dentro da suíte automatizada (Fase 1 §1);
// - nunca são executados por um agente de IA — só por um humano, num terminal interativo;
// - só aceitam um Supabase local (localhost/127.0.0.1) ou a URL de homologação declarada
//   explicitamente em HOMOLOG_SUPABASE_URL. Produção nunca.

import { createInterface } from "node:readline/promises";

export function requireSafeTarget() {
  if (process.env.CI) {
    fail("CI detectado. Estes helpers são do checklist MANUAL e nunca rodam em CI.");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("Terminal não interativo. Estes helpers só rodam à mão, por um humano, num terminal.");
  }

  const url = process.env.SUPABASE_URL;
  if (!url) fail("Defina SUPABASE_URL (Supabase local ou de homologação).");

  const { hostname } = new URL(url);
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const isHomolog = Boolean(process.env.HOMOLOG_SUPABASE_URL) && url === process.env.HOMOLOG_SUPABASE_URL;
  if (!isLocal && !isHomolog) {
    fail(
      `SUPABASE_URL=${url} não é local nem igual a HOMOLOG_SUPABASE_URL. Produção nunca é alvo destes helpers.`,
    );
  }
  return url;
}

export async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} Digite "sim" para continuar: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "sim") fail("Cancelado.");
}

function fail(message) {
  console.error(`\n[abortado] ${message}\n`);
  process.exit(1);
}
