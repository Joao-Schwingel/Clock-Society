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
  /** 1:1 (022): a pessoa deste login, com as empresas em que ela atende. */
  salesperson: { id: string; name: string; company_ids: string[] } | null;
}

export interface UsersRepo {
  /**
   * Alguém já usa este e-mail? `exceptUserId` é o próprio usuário na edição: salvar o diálogo sem
   * mexer no e-mail não pode dar conflito consigo mesmo.
   */
  emailExists(email: string, exceptUserId?: string): Promise<boolean>;
  /** A pessoa já tem login? (022: o vínculo é 1:1) */
  salespersonHasLogin(id: string): Promise<boolean>;
  /** O id é de uma pessoa deste inquilino? */
  salespersonInTenant(id: string, tenantId: string): Promise<boolean>;
  /** Dos ids informados, os que são empresas do inquilino. */
  companiesInTenant(companyIds: string[], tenantId: string): Promise<string[]>;
  /** Cria a pessoa e os acessos às empresas (022). */
  createSalesperson(input: { name: string; companyIds: string[]; tenantId: string }): Promise<string>;
  /**
   * Cria o login no Auth. **Não** cria o perfil: o `admin.createUser` do GoTrue insere o usuário e
   * só depois aplica o `app_metadata`, num UPDATE (ver docs/fase-6/vinculo-login-vendedor.md §3).
   */
  createAuthUser(input: {
    email: string;
    password: string;
    appRole: AppRole;
    tenantId: string;
    fullName: string;
  }): Promise<string>;
  /**
   * Garante o perfil do login recém-criado. O gatilho on_auth_user_created (013 + 021) faz o mesmo,
   * mas a criação não depende dele: foi essa dependência implícita que impediu qualquer usuário de
   * ser criado até a 021. Idempotente.
   */
  ensureProfile(input: {
    id: string;
    tenantId: string;
    role: AppRole;
    fullName: string;
    mustChangePassword: boolean;
  }): Promise<void>;
  deleteAuthUser(id: string): Promise<void>;
  updateProfile(id: string, patch: Partial<Pick<ProfileRow, "full_name" | "is_active" | "must_change_password">>): Promise<void>;
  /** Liga a pessoa ao login (salespersons.profile_id). */
  linkSalesperson(profileId: string, salespersonId: string): Promise<void>;
  /** Bloqueia ou libera o login no Auth (ban_duration), decisão 3.7. */
  setLoginBlocked(id: string, blocked: boolean): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
  /**
   * Troca o e-mail de login no Auth — o e-mail só existe lá (`profiles` não tem a coluna), então
   * não há dois lugares para divergir.
   */
  setEmail(id: string, email: string): Promise<void>;
  getProfile(id: string): Promise<ProfileRow | null>;
  listUsers(tenantId: string): Promise<UserSummary[]>;
}
