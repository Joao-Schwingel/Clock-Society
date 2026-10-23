# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js)
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm start        # Start production server
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest (unit tests, lib/calc/*)
pnpm test:watch   # Vitest in watch mode
pnpm test:e2e     # Playwright (E2E, against the local mock server — see Testing below)
```

## Architecture

**Stack**: Next.js 16 (App Router) + Supabase + TypeScript + Tailwind CSS v4 + shadcn/ui

**Language**: All UI text is in Brazilian Portuguese (PT-BR).

### Supabase Integration

Two client factories — use the right one depending on context:
- `lib/supabase/server.ts` → `createClient()` for **Server Components** and **Server Actions** (cookie-based)
- `lib/supabase/client.ts` → `createClient()` for **Client Components** (browser)

All tables except `sale_items`/`sale_salespersons` have RLS enabled in production (migration `019`, written in Fase 6 but **not yet applied**, turns it on — issue #9). Since release-2 Fase 3, `user_id` means the **tenant** (not the logged-in user): policies are `user_id = public.current_tenant_id() and public.is_admin()`, and `user_id` defaults to `current_tenant_id()`. **Never filter or insert by the logged-in user's id** (N3) — let RLS scope reads and the column default fill inserts. `sale_items`/`sale_salespersons` have policies inheriting from `sales`, but their RLS is still **off** in production until `019` is applied (it also sets `security_invoker` on the views and revokes the `anon` grants — issue #9, prerequisite for the vendor role).

Database schema lives in `scripts/*.sql` (migrations) and `scripts/views/` (DB views like `sales_with_details`).

**Schema changes only via migration** (rule added in release-2, Fase 1 — see `specs/release-2/fase-1-rede-de-testes.md` §11): never change the schema by hand in the Supabase dashboard. Add a new numbered file under `scripts/`, so the schema baseline (and the E2E mock server's fixtures, which mirror it — see Testing below) don't drift from what's actually deployed again.

### Auth Flow

Middleware (`middleware.ts` → `lib/supabase/middleware.ts`) reads `app_role`/`tenant_id` from the access-token claims via `supabase.auth.getClaims()` (injected by the custom access token hook, `scripts/014_auth_helpers.sql`; `getUser()` does **not** see them) and applies the pure decision table in `lib/auth/route-guard.ts`: no session → `/auth/login`; no role claim → refresh the session once, still none → `/403`; role without permission for the area → `/403`. Public routes: `/`, `/auth/login`, `/auth/error` (sign-up is closed). `/api/*` is passed through: route handlers do their own auth and answer 401/403 (`lib/users/auth.ts`). A `must_change_password` claim forces every page to `/auth/trocar-senha` until the user changes it (`app/api/me/password`, which clears the flag with the service key and refreshes the session). Post-login destination per role: `homeForRole()`.

**Salesperson model (migration `022`)**: `salespersons` is one row per **person** (`name`, `is_active`, `profile_id`), the companies they serve live in `salesperson_companies`, and the login link is 1:1 through `salespersons.profile_id` (unique) — `profile_salespersons` and `salespersons.company_id`/`commission_percentage` are gone. The commission percentage has always lived on the sale (`sale_salespersons.commission_percent`); the column on the salesperson was never read by any calculation. `022` merges duplicate records by (tenant, normalized name), keeps `salespersons_merge_map` for the rollback, and aborts on three guard conditions. Proof that history is preserved: `pnpm db:test:vinculo` compares `commission_summary()` before and after the migration and rehearses the rollback.

**Profile creation**: `createUser` (`lib/users/service.ts`) creates the profile itself via `UsersRepo.ensureProfile()` — it must not rely on the `on_auth_user_created` trigger, because GoTrue's `admin.createUser` inserts the user first and applies `app_metadata` in a later UPDATE. Migration `021` widens the trigger to `insert or update of raw_app_meta_data` for the other paths (dashboard, SQL). Both are regression-tested: `lib/users/service.test.ts` (the in-memory repo mirrors GoTrue and the FK) and `pnpm db:test:vinculo` (V-LINK-19/20). Full diagnosis in `docs/fase-6/vinculo-login-vendedor.md`.

**Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`): only in `lib/supabase/admin.ts`, which starts with `import "server-only"`. Never import it (or `lib/users/supabase-repo.ts`) from a `"use client"` file — a unit test and a CI step after `next build` check this (V-API-06). User management lives in `/api/users` (`lib/users/`: zod schemas, a service tested against an in-memory repo, and the Supabase repo).

### Roles and permissions (release-2)

- `lib/auth/permissions.ts` — permission catalog, mirror of `role_permissions` (seeded by the `insert into public.role_permissions` statements of the numbered migrations — 013, 020…; the A-PERM-01 unit test parses them and compares). Admin-only `users.manage` gates the **Usuários** tab (`components/dashboard/users/`).
- `lib/auth/session.ts` / `session-provider.tsx` — `AppSession` built from JWT claims in `app/dashboard/page.tsx`; `usePermissions()` and `<Can permission=…>` in client components.
- **Vendor role (Fase 6, migration `020`, not yet applied):** read-only policies added next to the admin ones — the vendor sees only sales where they appear in `sale_salespersons`, only their **own** `sale_salespersons` rows (never a colleague's commission %), inventory/companies where they work, the costs only of their own sales (read-only, for the sale detail), and nothing of fixed costs/contracts; the old views are admin-only. `vendor_sales` lists every salesperson of a sale but only the vendor's own commission %, and `commission_summary()` nulls colleagues' commission and hides inactive salespersons for vendors (issue #13). Vendor policies must reach `sale_salespersons` through `security definer` helpers (`vendor_can_see_sale()`, `my_salesperson_ids()`), never directly — a direct `sales` ↔ `sale_salespersons` reference causes "infinite recursion detected in policy" for everyone. No admin can be deactivated (`profiles_admin_always_active`).
- **Vendor area** (`/vendedor`, `app/vendedor/page.tsx` → `components/vendor/`): `homeForRole("vendedor")`; only the vendor role enters it, and the vendor never enters `/dashboard`. Tabs Vendas / Comissões / Estoque (`VENDOR_SUBTABS`); a forbidden admin tab forced in the URL is resolved against `ALL_SUBTABS` and shows `<AccessDenied/>`. It reuses the admin components in restricted mode: `useSalesQuery({ source: "vendor_sales" })`, `<SalesTable mode="vendor">` (no costs/net columns, no export, only the "eye" action), `<SaleDetailsModal readOnly>` (costs read from `sale_costs`), `<InventoryView readOnly>`, and the shared `<CommissionsBySalesperson>` over `commission_summary()`.
- `lib/auth/nav-registry.ts` — tabs declare the permission they need; `dashboard-layout.tsx`/`company-dashboard.tsx` render tabs from it, and a forbidden `?tab=`/`?company=` renders `<AccessDenied/>`. Don't add hard-coded tab lists.

### Key Patterns

**Data fetching**: Server Components do initial loads (e.g., `app/dashboard/page.tsx` fetches companies). Client Components fetch paginated/filtered data directly via Supabase client — no API routes.

**Pagination**: Server-side via Supabase `.range()`. Stats queries are separate (no pagination) from table queries (paginated, 10 per page). See `sales-view.tsx` for the canonical pattern.

**Filtering**: Table filters are lifted to the parent view component (e.g., `SalesView` owns filter state, passes to `SalesTable`). Search uses a confirm-button strategy (not debounce).

**Forms**: Simple forms use `useState` + manual validation. Complex forms use `react-hook-form` + `zod`. Forms render as modals/dialogs controlled by parent state (`isFormOpen`, `editingItem`).

**Tabs**: `useTabWithQuery` hook syncs active tab with URL query params (`?tab=...`, `?company=...`).

### Component Organization

- `components/ui/` — shadcn/ui primitives (do not edit manually; managed by shadcn CLI)
- `components/dashboard/` — feature components following a `*-view.tsx` / `*-table.tsx` / `*-form.tsx` pattern per domain (sales, inventory, costs, fixed-costs, contracts)
- `hooks/` — custom hooks (`use-queryTab`, `use-mobile`, `use-toast`)
- `lib/types.ts` — shared TypeScript interfaces (e.g., `SaleWithDetails` with nested costs/salespersons)

### Styling

Tailwind CSS v4 with OKLCH color variables defined in `app/globals.css`. Light/dark mode via `next-themes`. Utility: `cn()` from `lib/utils.ts` (clsx + tailwind-merge).

### Key Libraries

- **recharts** — charts in dashboard
- **sonner** — toast notifications (`toast.success(...)`). This is the *only* toast renderer mounted (`<Toaster/>` from `sonner` in `app/layout.tsx`). `hooks/use-toast.ts` (the shadcn/ui toast hook, used by `fixed-cost-form.tsx`, `contracts-form.tsx`, `contracts-table.tsx`) has no matching `<Toaster/>` mounted anywhere — its `toast({...})` calls are silently dropped (found in Fase 1 E2E testing). Don't rely on it being visible; use `sonner`'s `toast` for anything new.
- **date-fns** + **react-day-picker** — date handling (Brazilian DD/MM/YYYY format via `formatBR()` in `lib/utils.ts`)
- **lucide-react** — icons
- **@radix-ui/themes** — Spinner and theme primitives

### Testing (Fase 1 — `specs/release-2/fase-1-rede-de-testes.md`)

**No automated test, and no command run by an AI agent, ever connects to a real database** — local, staging, or production. This is enforced both by convention and by `.claude/settings.json`'s deny-list of destructive DB commands.

- **Unit** (Vitest): pure functions extracted from components into `lib/calc/*.ts` (e.g. `lib/calc/dashboard.ts`, `lib/calc/sales-stats.ts`). `vitest.config.ts` fixes the clock to 2026-09-15 12:00 `America/Sao_Paulo` and aliases `@/*`.
- **E2E** (Playwright, Chromium only): `e2e/tests/*.spec.ts`, run against `next dev` with `NEXT_PUBLIC_SUPABASE_URL` pointed at a **local mock server** (`e2e/mock-server/`) instead of Supabase — a small in-memory Auth (GoTrue) + REST (PostgREST) emulator, fixture-driven from `e2e/fixtures/*.json`, reset between tests via `POST /__test__/reset`. It exists because Playwright's `page.route()` only intercepts browser-made requests — it can't intercept the Supabase calls that `middleware.ts` and `app/dashboard/page.tsx` make server-side, which a pure route-mocking approach (as originally scoped) would miss entirely.
- `e2e/fixtures/expected-numbers.json` is the oracle: expected dashboard/sales/inventory/fixed-costs/contracts numbers for the fixture data, computed independently of the app code — E2E tests assert against it, not against the implementation.
- The mock server also emulates the token hook (claims from `e2e/fixtures/profiles.json`), session refresh, and tenant RLS (`e2e/mock-server/rls.mjs`). Requests **without** an `Authorization` header (the test harness itself) bypass RLS like `service_role`; the anon key gets nothing. Test hooks: `POST /__test__/reset`, `POST /__test__/legacy-tokens`, `GET /__test__/requests`.
- **Manual-only, never automated**: RLS/grants/view-isolation checks and a couple of DB-trigger checks live in `docs/manual-checklists/fase-1-checklist-banco.md` and `docs/manual-checklists/fase-2-checklist-banco-admin.md`, executed by a human against Supabase local/homologação. Migrations are applied by a human following a runbook (`docs/fase-3/runbook.md` for the admin window, already executed; `docs/fase-6/runbook.md` for the pending vendor window, which also covers the app deploy — `main` is still pre-Fase-3 and `022` is incompatible with what is live); each has a rollback in `scripts/rollback/`.
- **Environments** — the procedure for cloning production, publishing to a homologação project and pointing a Vercel preview at it lives in `docs/ambientes.md`, with a known-problems table; `scripts/local/README.md` is the per-script reference.
- **Local clone of production** (`scripts/local/`, see its README): a disposable copy of the production database in a local Supabase (Docker), for the manual DB checklists and for running the app against real data without touching production. Two paths, both read-only against production: `pnpm db:clone` (`pg_dump`, needs the Postgres password, faithful copy) and `pnpm db:clone:rest` (PostgREST + Auth Admin API with the `service_role` key, no DB password — schema comes from the migrations and drift is reported, logins get one test password, ids and e-mails preserved). The load runs with `session_replication_role = replica`, so no trigger fires and table order doesn't matter. `pnpm db:sql <file|-c SQL>` runs SQL against the clone. The SQL generator is a pure module (`scripts/local/clone-rest-sql.mjs`) with unit tests (`*.test.mjs`, now in `vitest.config.ts`'s include). **Humans only** — no AI agent runs these; `db:clone:rest` aborts without a TTY (Fase 1 §1).
- Two real app bugs were found and characterized (not fixed) during this work: a race between the two `useTabWithQuery` mounts on initial dashboard load (`hooks/use-queryTab.ts`, see `e2e/tests/nav.spec.ts`), and a likely production crash for brand-new users with zero companies (Next.js Request Memoization on the old auto-create-then-refetch in `app/dashboard/page.tsx`) — removed in Fase 3 together with the auto-create (A-BOOT-01).
