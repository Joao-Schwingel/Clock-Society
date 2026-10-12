// Um mini-motor de filtros/ordenação no formato de query string do PostgREST,
// o suficiente para as consultas que este app realmente faz (achado enumerado
// lendo os componentes). Não é um clone do PostgREST — é fixture-driven, em
// memória, nunca conectado a um banco.

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "columns"]);

// America/Sao_Paulo é UTC-3 o ano inteiro desde 2019 (sem horário de verão).
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

function isPlainDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isIsoTimestamp(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

// Converte um timestamp ISO (UTC) para a data de calendário em America/Sao_Paulo.
// Existe para que o filtro de intervalo de mês (construído com
// `new Date(year, month, 1).toISOString()` sob TZ=America/Sao_Paulo) inclua o
// dia 1 e o último dia do mês ao comparar com uma coluna `date` — o
// comportamento característico documentado em C-DASH-05/C-SALES-04.
function isoTimestampToSaoPauloDate(iso) {
  const shifted = new Date(new Date(iso).getTime() - SAO_PAULO_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function compareValues(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Semântica do operador jsonb `@>` do Postgres (PostgREST `cs`): objeto contém as chaves/valores
// pedidos; array contém cada elemento pedido em algum dos seus elementos.
function jsonContains(haystack, needle) {
  if (Array.isArray(needle)) {
    return Array.isArray(haystack) && needle.every((n) => haystack.some((h) => jsonContains(h, n)));
  }
  if (needle !== null && typeof needle === "object") {
    return (
      haystack !== null &&
      typeof haystack === "object" &&
      !Array.isArray(haystack) &&
      Object.entries(needle).every(([k, v]) => jsonContains(haystack[k], v))
    );
  }
  return haystack === needle;
}

function applyOp(rawValue, op, rawFilterValue) {
  const value = rawValue ?? null;

  if (op === "cs") {
    return jsonContains(value, JSON.parse(rawFilterValue));
  }

  if (op === "is") {
    if (rawFilterValue === "null") return value === null || value === undefined;
    return String(value) === rawFilterValue;
  }

  if (op === "in") {
    const list = rawFilterValue.replace(/^\(|\)$/g, "").split(",");
    return list.some((v) => String(value) === v);
  }

  if (op === "ilike") {
    const pattern = rawFilterValue.replace(/^%|%$/g, "").toLowerCase();
    return String(value ?? "").toLowerCase().includes(pattern);
  }

  // Comparações de data: coluna é "YYYY-MM-DD" e o filtro é um timestamp ISO
  // completo -> compara pela data de calendário em America/Sao_Paulo.
  if (["gte", "gt", "lte", "lt"].includes(op) && isPlainDate(value) && isIsoTimestamp(rawFilterValue)) {
    const filterDate = isoTimestampToSaoPauloDate(rawFilterValue);
    const cmp = compareValues(value, filterDate);
    if (op === "gte") return cmp >= 0;
    if (op === "gt") return cmp > 0;
    if (op === "lte") return cmp <= 0;
    return cmp < 0;
  }

  // Comparações numéricas ou de data simples (ambos os lados sem hora).
  const numA = Number(value);
  const numB = Number(rawFilterValue);
  const bothNumeric = value !== null && value !== "" && !Number.isNaN(numA) && !Number.isNaN(numB);
  const cmp = bothNumeric ? compareValues(numA, numB) : compareValues(String(value ?? ""), rawFilterValue);

  switch (op) {
    case "eq":
      return bothNumeric ? numA === numB : String(value) === rawFilterValue;
    case "neq":
      return bothNumeric ? numA !== numB : String(value) !== rawFilterValue;
    case "gt":
      return cmp > 0;
    case "gte":
      return cmp >= 0;
    case "lt":
      return cmp < 0;
    case "lte":
      return cmp <= 0;
    default:
      return false;
  }
}

// "col.op.val" -> preditor de linha.
function parseSimpleCondition(cond) {
  const firstDot = cond.indexOf(".");
  const col = cond.slice(0, firstDot);
  const rest = cond.slice(firstDot + 1);
  const secondDot = rest.indexOf(".");
  const op = rest.slice(0, secondDot);
  const val = rest.slice(secondDot + 1);
  return (row) => applyOp(row[col], op, val);
}

// Divide por vírgula respeitando parênteses (para and(...)/or(...) aninhados).
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function parseCondition(cond) {
  const m = /^(and|or)\((.*)\)$/s.exec(cond);
  if (m) {
    const [, kind, inner] = m;
    const subPredicates = splitTopLevel(inner).map(parseCondition);
    return (row) =>
      kind === "and" ? subPredicates.every((p) => p(row)) : subPredicates.some((p) => p(row));
  }
  return parseSimpleCondition(cond);
}

// Aplica todos os filtros de uma query string (exceto os parâmetros
// reservados) a uma lista de linhas.
export function filterRows(rows, searchParams) {
  const predicates = [];

  for (const key of new Set(searchParams.keys())) {
    if (RESERVED_PARAMS.has(key)) continue;

    if (key === "or") {
      for (const raw of searchParams.getAll("or")) {
        const inner = raw.replace(/^\(|\)$/g, "");
        const subPredicates = splitTopLevel(inner).map(parseCondition);
        predicates.push((row) => subPredicates.some((p) => p(row)));
      }
      continue;
    }

    for (const raw of searchParams.getAll(key)) {
      const dotIdx = raw.indexOf(".");
      const op = raw.slice(0, dotIdx);
      const val = raw.slice(dotIdx + 1);
      predicates.push((row) => applyOp(row[key], op, val));
    }
  }

  return rows.filter((row) => predicates.every((p) => p(row)));
}

export function orderRows(rows, searchParams) {
  const orderParam = searchParams.get("order");
  if (!orderParam) return rows;

  const clauses = orderParam.split(",").map((c) => {
    const [col, direction] = c.split(".");
    return { col, ascending: direction !== "desc" };
  });

  return [...rows].sort((a, b) => {
    for (const { col, ascending } of clauses) {
      const cmp = compareValues(a[col], b[col]);
      if (cmp !== 0) return ascending ? cmp : -cmp;
    }
    return 0;
  });
}

export function selectColumns(rows, searchParams) {
  const selectParam = searchParams.get("select");
  if (!selectParam || selectParam === "*") return rows;

  const columns = selectParam.split(",").map((c) => c.trim()).filter(Boolean);
  return rows.map((row) => {
    const out = {};
    for (const col of columns) out[col] = row[col];
    return out;
  });
}

export function paginate(rows, searchParams) {
  const offset = Number(searchParams.get("offset") ?? "0");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const total = rows.length;
  const page = limit === undefined ? rows.slice(offset) : rows.slice(offset, offset + limit);
  return { page, total, offset, limit };
}
