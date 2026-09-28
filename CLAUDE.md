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

All tables have RLS enabled; policies scope data to `auth.uid()`.

Database schema lives in `scripts/*.sql` (migrations) and `scripts/views/` (DB views like `sales_with_details`).

**Schema changes only via migration** (rule added in release-2, Fase 1 — see `specs/release-2/fase-1-rede-de-testes.md` §11): never change the schema by hand in the Supabase dashboard. Add a new numbered file under `scripts/`, so the schema baseline (and the E2E mock server's fixtures, which mirror it — see Testing below) don't drift from what's actually deployed again.

### Auth Flow

Middleware (`middleware.ts` → `lib/supabase/middleware.ts`) refreshes session cookies on every request. Unauthenticated users are redirected to `/auth/login`. Public routes: `/`, `/auth/login`, `/auth/sign-up`, `/auth/sign-up-success`, `/auth/error`.

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
- **Manual-only, never automated**: RLS/grants/view-isolation checks and a couple of DB-trigger checks (`fixed_costs.end_date`, the "Site" salesperson auto-create trigger) live in `docs/manual-checklists/fase-1-checklist-banco.md`, executed by a human against Supabase local/homologação.
- Two real app bugs were found and characterized (not fixed) during this work: a race between the two `useTabWithQuery` mounts on initial dashboard load (`hooks/use-queryTab.ts`, see `e2e/tests/nav.spec.ts`), and a likely production crash for brand-new users with zero companies, caused by Next.js Request Memoization returning a stale (pre-insert) empty result for the auto-create-then-refetch query in `app/dashboard/page.tsx` (documented as `test.fail()` in `e2e/tests/nav.spec.ts`).
