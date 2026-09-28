// Seed dos usuários e perfis da Fase 2 §4 — executado SÓ por um humano, contra um Supabase local
// ou de homologação, DEPOIS das migrations 013/014 (profiles precisa existir). Nunca em CI, nunca
// por um agente de IA (guard.mjs). Idempotente: usuário existente é reaproveitado, perfil é upsert.
// Nunca apaga nada.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/manual/fase-2/seed-usuarios.mjs
//
// Os dados de negócio de T1/T2 (empresas, vendas, …) continuam sendo montados à mão, como na
// Fase 1 (docs/manual-checklists/fase-1-checklist-banco.md, "Antes de começar").

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { confirm, requireSafeTarget } from "./guard.mjs";

const readFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../e2e/fixtures/${name}`, import.meta.url), "utf8"));

const users = readFixture("users.json");
const profiles = readFixture("profiles.json");

const url = requireSafeTarget();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("Defina SUPABASE_SERVICE_ROLE_KEY (do ambiente local/homologação).");
  process.exit(1);
}

await confirm(`Criar/atualizar ${users.length} usuários de teste e seus perfis em ${url}?`);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// id do fixture ("u-admin") → id real do auth.users
const realIds = new Map();

const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const u of users) {
  const found = existing.users.find((e) => e.email === u.email);
  if (found) {
    realIds.set(u.id, found.id);
    console.log(`= ${u.email} já existe (${found.id})`);
    continue;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  if (error) throw error;
  realIds.set(u.id, data.user.id);
  console.log(`+ ${u.email} criado (${data.user.id})`);
}

for (const p of profiles) {
  const row = {
    id: realIds.get(p.id),
    tenant_id: realIds.get(p.tenant_id),
    role: p.role,
    full_name: p.full_name,
    is_active: p.is_active,
    must_change_password: p.must_change_password,
  };
  const { error } = await admin.from("profiles").upsert(row);
  if (error) throw error;
  console.log(`~ perfil ${p.role} de ${p.id} (tenant ${p.tenant_id})`);
}

// Usuários do fixture que NÃO devem ter perfil (semperfil@t1). O gatilho on_auth_user_created
// (migration 013) pode ter criado um; este script não apaga nada, só avisa.
const withoutProfile = users.filter((u) => !profiles.some((p) => p.id === u.id));
for (const u of withoutProfile) {
  const { data, error } = await admin.from("profiles").select("id").eq("id", realIds.get(u.id));
  if (error) throw error;
  if (data.length > 0) {
    console.warn(
      `! ${u.email} deveria estar SEM perfil, mas o gatilho criou um (${realIds.get(u.id)}). ` +
        "Remova essa linha de profiles à mão, pelo SQL Editor do ambiente local, antes de A-DB-07.",
    );
  } else {
    console.log(`= ${u.email} sem perfil, como esperado`);
  }
}

console.log("\nPronto. Confira as claims com scripts/manual/fase-2/login-as.mjs <email>.");
