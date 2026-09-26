// Mock HTTP local de Auth (GoTrue) + REST (PostgREST), em memória, fixture-driven.
// Substitui um Supabase real para os testes E2E: nenhuma conexão de banco é
// aberta em nenhum momento (spec Fase 1 §2/§12). Cobre tanto as chamadas do
// navegador (interceptáveis por page.route()) quanto as chamadas que o
// próprio servidor Next.js faz (middleware.ts, app/dashboard/page.tsx,
// app/page.tsx) — que o Playwright não tem como interceptar.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { loadUsers, freshTables } from "./db.mjs";
import { filterRows, orderRows, paginate, selectColumns } from "./postgrest-filter.mjs";
import { VIEW_BUILDERS } from "./views.mjs";
import { signInWithPassword, getUserFromToken } from "./auth.mjs";

let users = loadUsers();
let tables = freshTables();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range",
};

function sendJson(res, status, body, extraHeaders = {}) {
  const headers = { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders };
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function wantsRepresentation(req) {
  return (req.headers["prefer"] ?? "").includes("return=representation");
}

function wantsCount(req) {
  return (req.headers["prefer"] ?? "").includes("count=exact");
}

function rowsForTable(name) {
  if (VIEW_BUILDERS[name]) return VIEW_BUILDERS[name](tables);
  return tables[name];
}

function contentRangeHeader(offset, pageLength, total) {
  if (pageLength === 0) return { "Content-Range": `*/${total}` };
  return { "Content-Range": `${offset}-${offset + pageLength - 1}/${total}` };
}

async function handleRest(req, res, url, table, method) {
  const isView = Boolean(VIEW_BUILDERS[table]);
  const baseRows = rowsForTable(table);

  if (baseRows === undefined) {
    sendJson(res, 404, { message: `Tabela/view desconhecida no mock: ${table}` });
    return;
  }

  if (method === "GET" || method === "HEAD") {
    const filtered = filterRows(baseRows, url.searchParams);
    const ordered = orderRows(filtered, url.searchParams);
    const { page, total, offset } = paginate(ordered, url.searchParams);
    const projected = selectColumns(page, url.searchParams);
    const headers = wantsCount(req) ? contentRangeHeader(offset, page.length, total) : {};
    sendJson(res, 200, method === "HEAD" ? undefined : projected, headers);
    return;
  }

  if (isView) {
    sendJson(res, 405, { message: `View ${table} é somente leitura no mock` });
    return;
  }

  if (method === "POST") {
    const body = await readJsonBody(req);
    const rowsToInsert = (Array.isArray(body) ? body : [body]).map((row) => ({
      id: row.id ?? randomUUID(),
      created_at: row.created_at ?? new Date().toISOString(),
      ...row,
    }));
    tables[table].push(...rowsToInsert);
    const body2 = wantsRepresentation(req) ? selectColumns(rowsToInsert, url.searchParams) : undefined;
    sendJson(res, 201, body2);
    return;
  }

  if (method === "PATCH") {
    const body = await readJsonBody(req);
    const matches = filterRows(tables[table], url.searchParams);
    const matchIds = new Set(matches.map((r) => r.id));
    const updated = [];
    tables[table] = tables[table].map((row) => {
      if (!matchIds.has(row.id)) return row;
      const next = { ...row, ...body };
      updated.push(next);
      return next;
    });
    const body2 = wantsRepresentation(req) ? selectColumns(updated, url.searchParams) : undefined;
    sendJson(res, wantsRepresentation(req) ? 200 : 204, body2);
    return;
  }

  if (method === "DELETE") {
    const matches = filterRows(tables[table], url.searchParams);
    const matchIds = new Set(matches.map((r) => r.id));
    tables[table] = tables[table].filter((row) => !matchIds.has(row.id));
    const body2 = wantsRepresentation(req) ? selectColumns(matches, url.searchParams) : undefined;
    sendJson(res, wantsRepresentation(req) ? 200 : 204, body2);
    return;
  }

  sendJson(res, 405, { message: `Método não suportado no mock: ${method}` });
}

async function handleAuth(req, res, url, method) {
  if (method === "POST" && url.pathname === "/auth/v1/token") {
    const grantType = url.searchParams.get("grant_type");
    const body = (await readJsonBody(req)) ?? {};

    if (grantType === "password") {
      const { status, body: respBody } = signInWithPassword(users, body.email, body.password);
      sendJson(res, status, respBody);
      return;
    }

    sendJson(res, 400, { error: "unsupported_grant_type", error_description: grantType });
    return;
  }

  if (method === "GET" && url.pathname === "/auth/v1/user") {
    const { status, body } = getUserFromToken(users, req.headers["authorization"]);
    sendJson(res, status, body);
    return;
  }

  if (method === "POST" && url.pathname === "/auth/v1/logout") {
    sendJson(res, 204, undefined);
    return;
  }

  sendJson(res, 404, { message: `Rota de auth desconhecida no mock: ${url.pathname}` });
}

export function createMockServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    try {
      if (url.pathname === "/__test__/reset" && method === "POST") {
        users = loadUsers();
        tables = freshTables();
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname.startsWith("/auth/v1/")) {
        await handleAuth(req, res, url, method);
        return;
      }

      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.replace("/rest/v1/", "");
        await handleRest(req, res, url, table, method);
        return;
      }

      sendJson(res, 404, { message: `Rota desconhecida no mock: ${url.pathname}` });
    } catch (err) {
      console.error("[mock-server] erro:", err);
      sendJson(res, 500, { message: String(err?.message ?? err) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_PORT ?? 3101);
  createMockServer().listen(port, () => {
    console.log(`[mock-server] escutando em http://127.0.0.1:${port} (sem banco de dados)`);
  });
}
