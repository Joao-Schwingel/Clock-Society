// Alvo de homologação, com a trava que impede apontar para produção por engano.
//
// > Usado só por scripts MANUAIS, rodados por um humano num terminal. Nunca em CI, nunca por um
// > agente de IA (mesma regra dos helpers da Fase 2).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fail } from "./docker-psql.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Lê uma variável do .env da raiz sem dar source no arquivo inteiro. */
function doEnvDoRepo(nome) {
  try {
    const linha = readFileSync(`${REPO_ROOT}.env`, "utf8")
      .split(/\r?\n/)
      .filter((l) => new RegExp(`^\\s*(?:export\\s+)?${nome}=`).test(l))
      .pop();
    return linha ? linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

/** Identificador do projeto na URL do Supabase: https://<ref>.supabase.co */
const refDaUrl = (url) => /https:\/\/([a-z0-9]+)\.supabase\./i.exec(url ?? "")?.[1] ?? null;

/**
 * Devolve a connection string de HOMOLOGAÇÃO, recusando qualquer coisa que pareça produção.
 *
 * A trava compara com o projeto do .env (o de produção): o identificador dele aparece tanto no
 * usuário do pooler (`postgres.<ref>`) quanto no host direto (`db.<ref>.supabase.co`), então basta
 * procurá-lo na URL de destino.
 */
export function alvoHomolog() {
  const url = process.env.HOMOLOG_DB_URL;
  if (!url) {
    fail(`defina HOMOLOG_DB_URL com a connection string do projeto de HOMOLOGAÇÃO.
     No PowerShell:  $env:HOMOLOG_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
     Pegue em Project Settings > Database > Connection string > URI (pooler, porta 5432).`);
  }

  const refProducao = refDaUrl(doEnvDoRepo("NEXT_PUBLIC_SUPABASE_URL"));
  if (refProducao && url.includes(refProducao)) {
    fail(`a HOMOLOG_DB_URL aponta para o projeto ${refProducao}, que é o do .env — ou seja, PRODUÇÃO.
     Estes scripts nunca escrevem em produção. Use o projeto de homologação.`);
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    fail("a HOMOLOG_DB_URL aponta para a sua máquina. Para o clone local, use pnpm db:sql.");
  }
  if (/:6543\//.test(url)) {
    fail("a porta 6543 é o pooler em modo transaction e não serve para pg_dump/pg_restore. Use a 5432 (session).");
  }

  return url;
}

/** Só mostra o começo da URL: o resto tem a senha. */
export const urlResumida = (url) => url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");

/** Trava comum: humano, terminal interativo, nunca CI. */
export function exigeHumano() {
  if (process.env.CI) fail("CI detectado. Este script é manual e nunca roda em CI.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("Terminal não interativo. Só roda à mão, por um humano, num terminal.");
  }
}
