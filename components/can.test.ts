import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionProvider } from "@/lib/auth/session-provider";
import type { AppSession } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/auth/permissions";
import { Can } from "./can";

// Fase 2 §5 / Fase 3 fatia 3.4. Renderiza com react-dom/server (sem DOM), por isso o arquivo é
// `.ts` e usa createElement em vez de JSX.

function session(permissions: AppSession["permissions"]): AppSession {
  return { userId: "u", tenantId: "t", role: "admin", salespersonIds: [], permissions };
}

function render(s: AppSession, fallback?: string) {
  return renderToStaticMarkup(
    createElement(
      SessionProvider,
      { session: s },
      createElement(Can, { permission: "sales.write", fallback }, "conteúdo"),
    ),
  );
}

describe("<Can>", () => {
  it("A-PERM-03 — mostra o conteúdo quando a sessão tem a permissão", () => {
    expect(render(session(permissionsForRole("admin")))).toBe("conteúdo");
  });

  it("A-PERM-03 — mostra o fallback (ou nada) quando a sessão não tem a permissão", () => {
    expect(render(session(["sales.view"]), "sem acesso")).toBe("sem acesso");
    expect(render(session(["sales.view"]))).toBe("");
  });
});
