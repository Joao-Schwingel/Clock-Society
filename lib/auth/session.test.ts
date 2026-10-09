import { describe, expect, it } from "vitest";
import { claimsFromJwt } from "./session";

describe("claimsFromJwt", () => {
  it("lê papel, inquilino e must_change_password de app_metadata (decisão 3.6)", () => {
    expect(
      claimsFromJwt({ app_metadata: { app_role: "vendedor", tenant_id: "t1", must_change_password: true } }),
    ).toEqual({ appRole: "vendedor", tenantId: "t1", mustChangePassword: true });
  });

  it("sem a claim, must_change_password é false", () => {
    expect(claimsFromJwt({ app_metadata: { app_role: "admin", tenant_id: "t1" } })).toEqual({
      appRole: "admin",
      tenantId: "t1",
      mustChangePassword: false,
    });
    expect(claimsFromJwt(null)).toEqual({ appRole: null, tenantId: null, mustChangePassword: false });
  });
});
