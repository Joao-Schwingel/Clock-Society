// Helpers `loginAs` e `readClaims` da Fase 2 §4 — usados SÓ por quem executa o checklist MANUAL
// (docs/manual-checklists/fase-2-checklist-banco-admin.md), nunca pela suíte automatizada.
//
// Uso (terminal interativo, Supabase local ou de homologação — ver guard.mjs):
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... \
//     node scripts/manual/fase-2/login-as.mjs admin@t1.test
// Imprime as claims do access token (A-DB-02). Como módulo, `loginAs` devolve um cliente
// supabase-js autenticado para os demais itens do checklist.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { requireSafeTarget } from "./guard.mjs";

const USERS = JSON.parse(
  readFileSync(new URL("../../../e2e/fixtures/users.json", import.meta.url), "utf8"),
);

export async function loginAs(email) {
  const url = requireSafeTarget();
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Defina SUPABASE_ANON_KEY.");

  const fixtureUser = USERS.find((u) => u.email === email);
  if (!fixtureUser) throw new Error(`${email} não está em e2e/fixtures/users.json.`);

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: fixtureUser.email,
    password: fixtureUser.password,
  });
  if (error) throw error;
  return { client, session: data.session };
}

// Decodifica o payload do access token (sem validar a assinatura — o token acabou de vir do
// próprio Auth). Devolve as claims que interessam ao A-DB-02.
export function readClaims(session) {
  const [, payload] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return {
    sub: claims.sub,
    role: claims.role,
    app_role: claims.app_metadata?.app_role ?? null,
    tenant_id: claims.app_metadata?.tenant_id ?? null,
    raw: claims,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node scripts/manual/fase-2/login-as.mjs <email do fixture>");
    process.exit(1);
  }
  const { session } = await loginAs(email);
  const { raw, ...claims } = readClaims(session);
  console.log(JSON.stringify(claims, null, 2));
  if (process.argv.includes("--raw")) console.log(JSON.stringify(raw, null, 2));
}
