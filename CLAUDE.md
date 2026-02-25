# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js)
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm start        # Start production server
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
- **sonner** — toast notifications (`toast.success(...)`)
- **date-fns** + **react-day-picker** — date handling (Brazilian DD/MM/YYYY format via `formatBR()` in `lib/utils.ts`)
- **lucide-react** — icons
- **@radix-ui/themes** — Spinner and theme primitives
