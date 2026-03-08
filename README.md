# RMint Restaurant App

Meal session planning app with AI co-worker panel. See [docs/architecture/00-OVERVIEW.md](docs/architecture/00-OVERVIEW.md) for the full design.

## Phase 0 — Project scaffold (current)

### Prerequisites

- [Bun](https://bun.sh/)
- [Convex](https://convex.dev) account
- (Optional) [Neon](https://neon.tech) and GitHub/Google OAuth apps for auth

### Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Convex**

   - **URLs:** Backend `https://calm-chickadee-544.convex.cloud`, HTTP/auth `https://calm-chickadee-544.convex.site`.
   - `.env.local` already has `NEXT_PUBLIC_CONVEX_URL` for this deployment. To link a different project or regenerate code, run `npx convex dev --configure=new`.

3. **Environment variables**

   - **Neon (server-side only):** In **Convex Dashboard → Settings → Environment Variables**, add:
     - `NEON_DATABASE_URL` = your Neon connection string (same value as `DATABASE_URL`; keep it only in Convex).
     To create the analytics tables, run: `DATABASE_URL='postgresql://...' bun run scripts/run-neon-ddl.ts` (or paste `scripts/neon-ddl.sql` into the Neon SQL Editor). Verify with the `testNeon:ping` action in the Convex dashboard.
   - **Auth:** In the same Convex env vars:
     - `SITE_URL` = `http://localhost:3000`
     - `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` and/or `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
     - `JWT_PRIVATE_KEY` and `JWKS` (from [Convex Auth setup](https://labs.convex.dev/auth/setup/manual)).

4. **Seed the database**

   In Convex dashboard → Functions → run `seed:seedDatabase` (internal mutation) once to create sample chain, restaurants, dishes, and rules.

5. **Run the app**

   ```bash
   bun dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Use “Sign in with GitHub” or “Sign in with Google” once OAuth is configured.

See **[docs/TESTING-PHASE0.md](docs/TESTING-PHASE0.md)** for a step-by-step testing guide.

### Phase 0 exit criteria

- [ ] `bun dev` starts Next.js at localhost:3000
- [ ] `npx convex dev` connects to the Convex backend
- [ ] Auth flow works (login, logout, identity check) after OAuth is configured
- [ ] Seed data is visible in the Convex dashboard (chain, 2 restaurants, dishes, templates)
- [ ] Neon connection verified from Convex dashboard (run `testNeon:ping` action) if Neon is set up
- [ ] shadcn components render correctly
- [ ] CI pipeline runs on push (set `CONVEX_DEPLOY_KEY` and `NEXT_PUBLIC_CONVEX_URL` in GitHub)

### Scripts

- `bun dev` — Next.js dev server (Turbopack)
- `bun run build` — Next.js production build
- `npx convex dev` — Convex backend dev (run with Convex configured)
- `scripts/neon-ddl.sql` — Analytics DDL (reference); apply via Neon SQL Editor or `scripts/run-neon-ddl.ts`
- `DATABASE_URL='...' bun run scripts/run-neon-ddl.ts` — Apply analytics tables to Neon (uses `NEON_DATABASE_URL` or `DATABASE_URL`)

## Tech stack

- **Next.js 15** (App Router, TypeScript, Turbopack)
- **Convex** — backend, reactive queries, auth
- **Neon** — analytics PostgreSQL (sync from Convex)
- **Tailwind CSS v4** + **shadcn/ui**
- **Jotai**, **react-hook-form**, **zod**, **date-fns**, **recharts**
