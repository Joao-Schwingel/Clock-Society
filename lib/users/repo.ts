// Acesso a dados da gestão de usuários (Fase 6, fatia 6.5). O serviço (service.ts) depende só desta
// interface: nos testes ela é um repositório em memória; em produção, supabase-repo.ts, com a chave
// de serviço e somente no servidor.

export type AppRole = "admin" | "vendedor";

export interface ProfileRow {
  id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  full_name: string | null;
}

export interface UserSummary {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  salespersons: { id: string; name: string; company_id: string }[];
}

export interface UsersRepo {
  emailExists(email: string): Promise<boolean>;
  /** Dos ids informados, os que já estão vinculados a algum login. */
  linkedSalespersonIds(ids: string[]): Promise<string[]>;
  /** Dos ids informados, os que pertencem ao inquilino. */
  salespersonIdsInTenant(ids: string[], tenantId: string): Promise<string[]>;
  companyInTenant(companyId: string, tenantId: string): Promise<boolean>;
  createSalesperson(input: { name: string; companyId: string; tenantId: string }): Promise<string>;
  /** Cria o login; o gatilho on_auth_user_created (013) cria o perfil a partir de app_metadata. */
  createAuthUser(input: {
    email: string;
    password: string;
    appRole: AppRole;
    tenantId: string;
    fullName: string;
  }): Promise<string>;
  deleteAuthUser(id: string): Promise<void>;
  updateProfile(id: string, patch: Partial<Pick<ProfileRow, "full_name" | "is_active" | "must_change_password">>): Promise<void>;
  linkSalespersons(profileId: string, salespersonIds: string[]): Promise<void>;
  /** Bloqueia ou libera o login no Auth (ban_duration), decisão 3.7. */
  setLoginBlocked(id: string, blocked: boolean): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
  getProfile(id: string): Promise<ProfileRow | null>;
  listUsers(tenantId: string): Promise<UserSummary[]>;
}
