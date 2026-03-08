# Testing Phase 0 Setup

Run through these checks to verify your scaffold.

---

## 1. Next.js app

```bash
bun install
bun dev
```

- Open **http://localhost:3000** (or **http://127.0.0.1:3001** if 3000 is in use).
- You should see the **RMint — Seed data** page (Chains, Restaurants, Dishes, etc.). No auth UI.

---

## 2. Convex backend

```bash
npx convex dev
```

- Leave it running (or run once with `npx convex dev --once` to push and exit).
- It should connect to **calm-chickadee-544** and push your `convex/` functions.
- If it prompts to log in, complete the browser flow.

---

## 3. Seed data

After Convex is deployed:

**Option A – Convex Dashboard**

1. Go to [Convex Dashboard](https://dashboard.convex.dev/d/calm-chickadee-544) → **Functions**.
2. Find **seed:seedDatabase** (internal mutation).
3. Click **Run** with args `{}`.
4. Check **Data** for:
   - **chains** – 1 row (Coastal Kitchen Group)
   - **restaurants** – 2 rows (Downtown, Beach)
   - **dishes** – 8 rows
   - **menuTemplates** – 3 rows
   - **aiRules** – 2 rows

**Option B – Convex MCP in Cursor**

Ask the assistant to run the `seed:seedDatabase` function via the Convex MCP (after `npx convex dev` has been run at least once).

---

## 4. Neon connection

**Option A – Convex Dashboard**

1. Dashboard → **Functions** → **testNeon:ping** (action).
2. Click **Run** with args `{}`.
3. Result should be something like: `{ "ok": true, "now": "2026-03-08T..." }`.
4. If you see `ok: false` and "NEON_DATABASE_URL not set", add that env var in **Settings → Environment Variables**.

**Option B – Convex MCP**

Ask the assistant to run **testNeon:ping** via the Convex MCP.

---

## 5. Auth (optional, deferred)

Auth is not wired up in the app yet. When you add it back, configure OAuth in Convex and use the auth provider again.

---

## 6. Build

```bash
bun run build
```

- Should complete without errors (Convex folder is excluded from the Next.js TypeScript build).

---

## 7. shadcn components render correctly

The seed data page uses **Card**, **Badge**, **Table** (TableHeader, TableBody, TableRow, TableCell, TableHead). If the app builds and the seed data page loads in the browser, shadcn is rendering.

**Quick check:**

1. Run `bun dev` and open the app.
2. You should see:
   - Cards with titles (Chains, Restaurants, Dishes, …) and a small gray badge with the count.
   - A table for Dishes with columns Name, Category, Cuisine, Price, Cost.
   - Ingredient names as pill-style badges.
3. Run `bun run build` — if it succeeds, all shadcn imports and styles resolve correctly.

No separate “shadcn test” is required; the seed data page is the visual test.

---

## 8. CI pipeline runs on push

The workflow [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs on **push to `main`**. It has two jobs:

| Job             | What it does              | Required secrets/vars                          |
|-----------------|---------------------------|-----------------------------------------------|
| `deploy-convex` | `bun install` + `npx convex deploy` | **CONVEX_DEPLOY_KEY** (repo secret)           |
| `deploy-next`   | `bun install` + `bun run build`     | **NEXT_PUBLIC_CONVEX_URL** (repo variable)    |

**How to test CI:**

1. **Configure GitHub (once)**  
   - Repo → **Settings** → **Secrets and variables** → **Actions**.  
   - Add **Secret**: `CONVEX_DEPLOY_KEY` (from [Convex Dashboard](https://dashboard.convex.dev) → Settings → Deploy Key).  
   - Add **Variable**: `NEXT_PUBLIC_CONVEX_URL` = `https://calm-chickadee-544.convex.cloud`.

   **Or use GitHub CLI** — one-shot after auth:

   ```bash
   gh auth login -h github.com -p https -w   # complete in browser
   ./scripts/github-create-repo-and-setup-ci.sh
   ```

   That script creates the repo `bkrmint/rmint_restaurant_app` (if missing), adds `origin`, pushes, then sets the variable and prompts for the Convex deploy key. To use a different repo, run `GITHUB_REPO=owner/repo ./scripts/github-create-repo-and-setup-ci.sh`.

2. **Trigger the pipeline**  
   - Push to `main` (e.g. merge a PR or push directly).  
   - Open the repo on GitHub → **Actions** tab.  
   - Click the latest “Deploy” workflow run.

3. **Verify**  
   - Both jobs should be green.  
   - If `deploy-convex` fails: check `CONVEX_DEPLOY_KEY`.  
   - If `deploy-next` fails: check `NEXT_PUBLIC_CONVEX_URL` and that `bun run build` works locally (see §6).

**Test CI without Convex deploy (build only):**  
You can run the same steps as `deploy-next` locally:

```bash
bun install --frozen-lockfile
NEXT_PUBLIC_CONVEX_URL=https://calm-chickadee-544.convex.cloud bun run build
```

If this succeeds, the CI build job will pass once the variable is set in GitHub.

---

## Quick checklist

| Step              | Command / action                         | Pass? |
|-------------------|------------------------------------------|--------|
| Next.js           | `bun dev` → open localhost, see seed data page | ☐ |
| Convex deploy     | `npx convex dev` (or `--once`)           | ☐ |
| Seed              | Run `seed:seedDatabase` in dashboard/MCP | ☐ |
| Data              | Dashboard → Data → chains, restaurants   | ☐ |
| Neon              | Run `testNeon:ping` in dashboard/MCP     | ☐ |
| Build             | `bun run build`                          | ☐ |
| shadcn            | Seed data page shows cards, table, badges | ☐ |
| CI on push        | Push to main → Actions → both jobs green | ☐ |

---

## Troubleshooting

- **"No CONVEX_DEPLOYMENT set"**  
  Ensure `.env.local` has `CONVEX_DEPLOYMENT=calm-chickadee-544` and that you’ve run `npx convex dev` at least once from this project.

- **"Could not find function testNeon:ping"**  
  Run `npx convex dev` (or `npx convex deploy`) so your Convex functions are pushed.

- **testNeon:ping returns `ok: false`**  
  Set `NEON_DATABASE_URL` in Convex Dashboard → Settings → Environment Variables (same value as your Neon `DATABASE_URL`).

- **Auth redirect or "Invalid callback"**  
  In GitHub/Google OAuth app settings, set the callback URL to  
  `https://calm-chickadee-544.convex.site/api/auth/callback/github` (or `/google`), and ensure `SITE_URL` is set in Convex env vars.
