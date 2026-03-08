# 08 — Implementation Phases

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)

---

## Table of Contents

1. [Phase Overview](#1-phase-overview)
2. [Phase 0: Project Scaffold (Week 1)](#2-phase-0-project-scaffold-week-1)
3. [Phase 1: Three-Panel Layout + Calendar (Week 2)](#3-phase-1-three-panel-layout--calendar-week-2)
4. [Phase 2: Meal Session Workflow (Weeks 3–4)](#4-phase-2-meal-session-workflow-weeks-34)
5. [Phase 3: AI Co-Worker Panel (Weeks 5–6)](#5-phase-3-ai-co-worker-panel-weeks-56)
6. [Phase 4: Multi-Model + Multimodal (Week 7)](#6-phase-4-multi-model--multimodal-week-7)
7. [Phase 5: Proactive Intelligence (Week 8)](#7-phase-5-proactive-intelligence-week-8)
8. [Phase 6: Chain Hierarchy + Collaboration (Week 9)](#8-phase-6-chain-hierarchy--collaboration-week-9)
9. [Phase 7: Polish + Production (Week 10)](#9-phase-7-polish--production-week-10)
10. [Risk Register](#10-risk-register)
11. [Document Suite Summary](#11-document-suite-summary)

---

## 1. Phase Overview

Eight phases over ten weeks, progressing from scaffold to production. Each phase builds on the previous one and delivers a testable increment.

| Phase | Duration | Focus | Key Deliverables |
|-------|----------|-------|-----------------|
| **0** | Week 1 | Project Scaffold | Next.js + Convex + Neon + Auth + Seed data |
| **1** | Week 2 | Layout + Calendar | Three-panel shell, calendar, session tree, routing |
| **2** | Weeks 3–4 | Meal Session Workflow | All 5 workspace steps with Convex queries/mutations |
| **3** | Weeks 5–6 | AI Co-Worker Panel | Agents, chat, suggestions, PendingChange approval |
| **4** | Week 7 | Multi-Model + Multimodal | Gemini integration, image analysis, Recipe Expert |
| **5** | Week 8 | Proactive Intelligence | Background crons, alerts, Rules Engine |
| **6** | Week 9 | Chain Hierarchy + Collaboration | Multi-restaurant, locking, Neon sync, Financial Analyst |
| **7** | Week 10 | Polish + Production | Error handling, responsive, analytics dashboard, deploy |

### Dependency Graph

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
                                        │             │
                                        ▼             │
                                     Phase 5 ◀────────┘
                                        │
                                        ▼
                                     Phase 6 ──→ Phase 7
```

---

## 2. Phase 0: Project Scaffold (Week 1)

**Goal:** A runnable project with all infrastructure configured, authentication working, and seed data in Convex.

### Tasks

#### 0.1 Initialize Next.js + Bun Project

```bash
bun create next-app rmint-restaurant-app --typescript --tailwind --app --src-dir
cd rmint-restaurant-app
```

- Next.js 14+ with App Router
- TypeScript in strict mode
- `src/` directory structure
- Bun as runtime and package manager

#### 0.2 Set Up Convex

```bash
bun add convex
npx convex init
```

- Create `convex/schema.ts` with the full schema from [06-DATA-LAYER.md](./06-DATA-LAYER.md)
- Configure `convex.config.ts` with `@convex-dev/agents` component
- Verify deployment with `npx convex dev`

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import agents from "@convex-dev/agents/convex.config";

const app = defineApp();
app.use(agents);

export default app;
```

#### 0.3 Set Up Neon PostgreSQL

```bash
bun add @neondatabase/serverless drizzle-orm drizzle-kit
```

- Provision Neon database via dashboard
- Run DDL from [06-DATA-LAYER.md](./06-DATA-LAYER.md) Section 4
- Store `NEON_DATABASE_URL` in Convex environment variables
- Verify connection from a test Convex action

```typescript
// Quick verification (remove after testing)
// convex/testNeon.ts
"use node";

import { action } from "./_generated/server";
import { neon } from "@neondatabase/serverless";

export const ping = action({
  args: {},
  handler: async () => {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const result = await sql`SELECT NOW() as now`;
    return result[0].now;
  },
});
```

#### 0.4 Install and Configure Tailwind + shadcn/ui

```bash
bunx --bun shadcn@latest init
bunx --bun shadcn@latest add button card input label dialog dropdown-menu
bunx --bun shadcn@latest add table tabs badge separator scroll-area
bunx --bun shadcn@latest add tooltip popover calendar select switch
bun add date-fns recharts jotai react-hook-form @hookform/resolvers zod
```

- Configure Tailwind CSS v4
- Set up theme colors (primary, secondary, muted, accent)
- Add dark mode support via `class` strategy
- Install all shadcn components needed across workspace steps

#### 0.5 Set Up Convex Auth

```bash
bun add @convex-dev/auth @auth/core
```

- Configure auth provider (GitHub OAuth for development, Google OAuth for production)
- Set up `ConvexProviderWithAuth` wrapper
- Create auth helper functions (`requireAuth`, `requireChainAccess`, etc.)
- Verify login/logout flow

```typescript
// convex/auth.ts
import { convexAuth } from "@convex-dev/auth/server";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Google],
});
```

#### 0.6 Seed Data

Create a seed script that populates the Convex database with sample data for development.

```typescript
// convex/seed.ts
import { internalMutation } from "./_generated/server";

export const seedDatabase = internalMutation({
  args: {},
  handler: async (ctx) => {
    const chainId = await ctx.db.insert("chains", {
      name: "Coastal Kitchen Group",
      slug: "coastal-kitchen",
      defaultCurrency: "USD",
      defaultTimezone: "America/New_York",
      settings: {
        defaultMarginTarget: 30,
        defaultLaborCostPerHour: 18,
        maxPrepTimeMinutes: 60,
        allowedCuisines: ["Indian", "Thai", "Italian", "American"],
      },
      ownerId: "seed-user-001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const restaurant1 = await ctx.db.insert("restaurants", {
      chainId,
      name: "Coastal Kitchen Downtown",
      slug: "downtown",
      address: "123 Main St",
      city: "Charleston",
      state: "SC",
      timezone: "America/New_York",
      seatingCapacity: 80,
      avgDailyCovers: 150,
      laborCostPerHour: 18,
      settings: {
        operatingHours: {
          breakfast: { start: "07:00", end: "10:30" },
          lunch: { start: "11:30", end: "14:30" },
          dinner: { start: "17:30", end: "22:00" },
        },
      },
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const restaurant2 = await ctx.db.insert("restaurants", {
      chainId,
      name: "Coastal Kitchen Beach",
      slug: "beach",
      address: "456 Ocean Ave",
      city: "Charleston",
      state: "SC",
      timezone: "America/New_York",
      seatingCapacity: 120,
      avgDailyCovers: 200,
      laborCostPerHour: 20,
      settings: {
        overrideMarginTarget: 35,
        operatingHours: {
          breakfast: { start: "08:00", end: "11:00" },
          lunch: { start: "11:30", end: "15:00" },
          dinner: { start: "18:00", end: "23:00" },
        },
      },
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed ingredients
    const ingredients = [
      { name: "Chicken Breast", category: "protein" as const, unit: "lb", price: 4.50 },
      { name: "Basmati Rice", category: "grain" as const, unit: "lb", price: 1.80 },
      { name: "Fresh Salmon", category: "protein" as const, unit: "lb", price: 12.00 },
      { name: "Mixed Greens", category: "produce" as const, unit: "lb", price: 3.20 },
      { name: "Potatoes", category: "produce" as const, unit: "lb", price: 1.20 },
      { name: "Heavy Cream", category: "dairy" as const, unit: "qt", price: 4.00 },
      { name: "Olive Oil", category: "oil_fat" as const, unit: "L", price: 8.50 },
      { name: "Garam Masala", category: "spice" as const, unit: "oz", price: 2.40 },
    ];

    const ingredientIds: Record<string, any> = {};
    for (const ing of ingredients) {
      ingredientIds[ing.name] = await ctx.db.insert("ingredients", {
        restaurantId: restaurant1,
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        currentPricePerUnit: ing.price,
        priceLastUpdated: Date.now(),
        isLocal: false,
        isOrganic: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Seed dishes
    const dishes = [
      { name: "Butter Chicken", category: "main" as const, cuisine: "Indian", price: 18.50, cost: 5.20, prep: 35 },
      { name: "Chicken Tikka Masala", category: "main" as const, cuisine: "Indian", price: 19.00, cost: 5.50, prep: 40 },
      { name: "Grilled Salmon", category: "main" as const, cuisine: "American", price: 24.00, cost: 9.00, prep: 25 },
      { name: "Caesar Salad", category: "appetizer" as const, cuisine: "American", price: 12.00, cost: 3.00, prep: 10 },
      { name: "Pad Thai", category: "main" as const, cuisine: "Thai", price: 16.00, cost: 4.80, prep: 20 },
      { name: "Margherita Pizza", category: "main" as const, cuisine: "Italian", price: 15.00, cost: 4.00, prep: 15 },
      { name: "Mango Sticky Rice", category: "dessert" as const, cuisine: "Thai", price: 10.00, cost: 2.80, prep: 30 },
      { name: "Tiramisu", category: "dessert" as const, cuisine: "Italian", price: 11.00, cost: 3.20, prep: 45 },
    ];

    for (const dish of dishes) {
      await ctx.db.insert("dishes", {
        restaurantId: restaurant1,
        name: dish.name,
        category: dish.category,
        cuisineType: dish.cuisine,
        basePrice: dish.price,
        costPerServing: dish.cost,
        prepTimeMinutes: dish.prep,
        portionSize: "1 serving",
        allergens: [],
        dietaryTags: [],
        isSeasonalItem: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Seed menu templates
    await ctx.db.insert("menuTemplates", {
      restaurantId: restaurant1,
      name: "Indian Classics",
      description: "Traditional Indian dishes with modern plating",
      cuisineType: "Indian",
      mealType: "dinner",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("menuTemplates", {
      restaurantId: restaurant1,
      name: "Coastal Favorites",
      description: "Seafood and salads for lunch service",
      cuisineType: "American",
      mealType: "lunch",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("menuTemplates", {
      restaurantId: restaurant1,
      name: "Thai Street Food",
      description: "Authentic Thai dishes, quick prep",
      cuisineType: "Thai",
      mealType: "all",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed AI rules
    await ctx.db.insert("aiRules", {
      scope: "chain",
      scopeId: chainId,
      ruleType: "margin_threshold",
      label: "Minimum 25% margin",
      description: "All dishes must maintain at least 25% profit margin",
      config: { operator: "gte", field: "margin", value: 25 },
      priority: 80,
      isActive: true,
      createdBy: "seed-user-001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("aiRules", {
      scope: "chain",
      scopeId: chainId,
      ruleType: "prep_time_limit",
      label: "Max 60 min prep time",
      config: { operator: "lte", field: "prepTimeMinutes", value: 60 },
      priority: 60,
      isActive: true,
      createdBy: "seed-user-001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

#### 0.7 CI/CD Setup

- GitHub repository initialization
- GitHub Actions workflow for `npx convex deploy` on main branch push
- Vercel project for Next.js deployment (preview on PR, production on main)
- Environment variable configuration (Convex URL, Neon URL, Auth secrets)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-convex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: npx convex deploy
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

  deploy-next:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
```

### Phase 0 Exit Criteria

- [ ] `bun dev` starts Next.js at localhost:3000
- [ ] `npx convex dev` connects to Convex backend
- [ ] Authentication flow works (login, logout, identity check)
- [ ] Seed data visible in Convex dashboard (chain, 2 restaurants, dishes, templates)
- [ ] Neon connection verified from Convex action
- [ ] shadcn components render correctly
- [ ] CI pipeline runs on push

---

## 3. Phase 1: Three-Panel Layout + Calendar (Week 2)

**Goal:** The three-panel shell is fully functional with responsive behavior, calendar navigation loads meal sessions from Convex, and URL routing reflects the selected context.

### Tasks

#### 1.1 ThreePanelLayout Component

Build the top-level layout shell that manages three panels with resizable borders.

```typescript
// src/components/layout/ThreePanelLayout.tsx
"use client";

import { useState } from "react";
import { useAtom } from "jotai";
import { calendarPanelOpenAtom, aiPanelOpenAtom } from "@/lib/atoms";

export function ThreePanelLayout({
  calendar,
  workspace,
  aiPanel,
}: {
  calendar: React.ReactNode;
  workspace: React.ReactNode;
  aiPanel: React.ReactNode;
}) {
  const [calendarOpen] = useAtom(calendarPanelOpenAtom);
  const [aiOpen] = useAtom(aiPanelOpenAtom);

  return (
    <div className="flex h-screen overflow-hidden">
      {calendarOpen && (
        <aside className="w-[260px] border-r bg-muted/30 flex-shrink-0 overflow-y-auto">
          {calendar}
        </aside>
      )}

      <main className="flex-1 overflow-y-auto min-w-0">
        {workspace}
      </main>

      {aiOpen && (
        <aside className="w-[360px] border-l bg-muted/10 flex-shrink-0 overflow-y-auto">
          {aiPanel}
        </aside>
      )}
    </div>
  );
}
```

- Panel widths: Calendar 200–280px, Workspace flex-1, AI Panel 320–380px
- Toggle buttons for each side panel
- Responsive: tablet collapses to 2 panels, mobile to single panel with tabs

#### 1.2 Calendar Widget

- Mini monthly calendar using shadcn Calendar component
- Date range picker for multi-day planning view
- Highlight dates that have meal sessions
- Today indicator, navigation arrows

```typescript
// src/components/calendar/CalendarWidget.tsx
"use client";

import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useState } from "react";

export function CalendarWidget({
  restaurantId,
  onDateSelect,
}: {
  restaurantId: Id<"restaurants">;
  onDateSelect: (date: Date) => void;
}) {
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const sessions = useQuery(api.mealSessions.listByDateRange, {
    restaurantId,
    startDate: format(startOfMonth(month), "yyyy-MM-dd"),
    endDate: format(endOfMonth(month), "yyyy-MM-dd"),
  });

  const datesWithSessions = new Set(
    sessions?.map((s) => s.date) ?? []
  );

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    setSelectedDate(date);
    onDateSelect(date);
  }

  return (
    <Calendar
      mode="single"
      selected={selectedDate}
      onSelect={handleSelect}
      month={month}
      onMonthChange={setMonth}
      modifiers={{
        hasSessions: (date) => datesWithSessions.has(format(date, "yyyy-MM-dd")),
      }}
      modifiersClassNames={{
        hasSessions: "bg-primary/10 font-semibold",
      }}
    />
  );
}
```

#### 1.3 Session Tree Component

- Tree view below calendar: Date > Meal Type (breakfast/lunch/dinner) > Workflow Steps
- Status indicators (draft, planning, review, published)
- PendingChange badge count per session
- Click to navigate to session + step

#### 1.4 Restaurant/Chain Picker

- Dropdown at top of calendar panel
- Shows chain name with list of restaurants
- Switching restaurant updates all queries

#### 1.5 Route Structure

```
src/app/
├── layout.tsx                           # Root layout with Providers
├── page.tsx                             # Redirect to default restaurant
└── [restaurantId]/
    ├── layout.tsx                       # ThreePanelLayout shell
    └── plan/
        └── [date]/
            └── [meal]/
                ├── page.tsx             # Redirect to current step
                ├── ai-rules/page.tsx    # Step 1: AI Rules
                ├── packaging/page.tsx   # Step 2: Packaging
                ├── implementation/page.tsx  # Step 3: Implementation
                ├── finances/page.tsx    # Step 4: Finances
                └── menu/page.tsx        # Step 5: Menu
```

#### 1.6 Convex Queries for Calendar

- `mealSessions.listByDateRange` — fetch sessions for calendar highlighting
- `mealSessions.getByDateMeal` — fetch a specific session for workspace
- `restaurants.listByChain` — populate restaurant picker

### Phase 1 Exit Criteria

- [ ] Three panels render at correct widths with toggle behavior
- [ ] Calendar highlights dates with sessions
- [ ] Clicking a date loads sessions in the tree
- [ ] Clicking a session navigates to the correct URL
- [ ] URL changes update the workspace content
- [ ] Restaurant picker switches context

---

## 4. Phase 2: Meal Session Workflow (Weeks 3–4)

**Goal:** All five workspace steps are fully functional with Convex-powered data entry and real-time updates. A user can create a session, configure rules, select menus, adjust prices, review costs, and publish.

### Week 3: Steps 1–3

#### 2.1 AI Rules Step

- Display rules at three scope levels (chain, restaurant, session)
- Add rule form with type selector, operator, value
- Toggle rule active/inactive
- Delete rule
- Visual indicators for rule cascade (which level a rule came from)
- Convex queries: `aiRules.listByScope`
- Convex mutations: `aiRules.create`, `aiRules.toggleActive`, `aiRules.remove`

#### 2.2 Packaging Step

- **Menu Carousel**: Horizontal scrolling list of menu templates for the restaurant. Click to select/deselect. Selected menus expand to show their dishes.
- **Cost Table**: Table of session dishes with columns: Dish Name, Category, Base Price, Override Price (editable), Cost/Serving, Margin %, Quantity (editable), Included (toggle). All editable fields write directly to Convex via mutations.
- **Estimated Outcome Card**: Real-time projected revenue, cost, and profit based on current dish selection and prices. Updates automatically as the user edits.
- **Prime Cost Gauge**: Visual indicator showing prime cost percentage with target range.

```typescript
// src/components/workspace/steps/PackagingStep.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MenuCarousel } from "./packaging/MenuCarousel";
import { CostTable } from "./packaging/CostTable";
import { EstimatedOutcome } from "./packaging/EstimatedOutcome";

export function PackagingStep({
  sessionId,
  restaurantId,
}: {
  sessionId: Id<"mealSessions">;
  restaurantId: Id<"restaurants">;
}) {
  const menus = useQuery(api.sessionMenus.listBySession, { sessionId });
  const dishes = useQuery(api.sessionDishes.listBySession, {
    sessionId,
    includedOnly: false,
  });
  const financials = useQuery(api.sessionFinancials.getBySession, { sessionId });
  const templates = useQuery(api.menuTemplates.listByRestaurant, { restaurantId });

  const updatePrice = useMutation(api.sessionDishes.updatePrice);
  const updateQuantity = useMutation(api.sessionDishes.updateQuantity);
  const toggleIncluded = useMutation(api.sessionDishes.toggleIncluded);
  const selectMenu = useMutation(api.sessionMenus.selectTemplate);

  if (!menus || !dishes || !templates) return <LoadingSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <MenuCarousel
        templates={templates}
        selectedMenus={menus}
        onSelect={(templateId) => selectMenu({ sessionId, menuTemplateId: templateId })}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <CostTable
            dishes={dishes}
            onPriceChange={(id, price) => updatePrice({ sessionDishId: id, newPrice: price })}
            onQuantityChange={(id, qty) => updateQuantity({ sessionDishId: id, quantity: qty })}
            onToggleIncluded={(id, included) => toggleIncluded({ sessionDishId: id, isIncluded: included })}
          />
        </div>
        <div>
          {financials && <EstimatedOutcome financials={financials} />}
        </div>
      </div>
    </div>
  );
}
```

#### 2.3 Implementation Step

- Recipe viewer: select a dish to see full recipe
- Step-by-step instructions with images
- Chef notes section
- Video placeholder (populated in Phase 4)
- Convex queries: `recipes.getByDish`

### Week 4: Steps 4–5 + Publish

#### 2.4 Finances Step

- **Cost Input Form**: Labor cost (total + per hour calculation), overhead costs, custom cost line items. All fields save to `sessionFinancials` via mutations.
- **Financial Projections Dashboard**: Revenue, total cost, profit, prime cost %, food cost %, labor cost %. Visual chart using Recharts.
- **Break-Even Analysis**: Break-even covers calculation and display.
- **Scenario Snapshots**: Save current financials as a named snapshot for comparison. Display comparison table.

```typescript
// Convex query for financial projections
// convex/sessionFinancials.ts
export const getBySession = query({
  args: { sessionId: v.id("mealSessions") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("sessionFinancials")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

export const saveScenarioSnapshot = mutation({
  args: {
    sessionId: v.id("mealSessions"),
    label: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const financials = await ctx.db
      .query("sessionFinancials")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!financials) throw new Error("No financials for session");

    const snapshot = {
      label: args.label,
      revenue: financials.projectedRevenue,
      profit: financials.projectedProfit,
      primeCost: financials.primeCostPercentage,
      createdAt: Date.now(),
    };

    const existing = financials.scenarioSnapshots ?? [];
    await ctx.db.patch(financials._id, {
      scenarioSnapshots: [...existing, snapshot],
    });
  },
});
```

#### 2.5 Menu Step (Publish Flow)

- Final review: summary of all selected dishes, prices, financials
- Side-by-side comparison with any saved scenario snapshots
- **Publish button**: transitions session from `review` → `published`
- Post-publish: triggers Neon sync (Phase 6), locks session from further edits
- Session status badge updates across all views

```typescript
// convex/mealSessions.ts (partial)
export const publish = mutation({
  args: { sessionId: v.id("mealSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "published") throw new Error("Already published");

    await ctx.db.patch(args.sessionId, {
      status: "published",
      currentStep: "menu",
      publishedAt: Date.now(),
      publishedBy: identity.subject,
      updatedAt: Date.now(),
    });

    // Schedule Neon sync (Phase 6)
    // await ctx.scheduler.runAfter(0, internal.sync.analyticsSync.syncSession, {
    //   sessionId: args.sessionId,
    // });
  },
});
```

#### 2.6 File Upload for Food Images

- Image upload component on dishes in Packaging step
- Uses Convex Storage flow from [06-DATA-LAYER.md](./06-DATA-LAYER.md) Section 6
- Image display in Cost Table and Implementation step

### Phase 2 Exit Criteria

- [ ] All 5 steps render and accept user input
- [ ] Editing a price in Packaging immediately updates Estimated Outcome
- [ ] Adding/removing dishes updates financial projections
- [ ] Scenario snapshots can be saved and compared
- [ ] Publish flow transitions session status
- [ ] Food images can be uploaded and displayed
- [ ] Step navigation works via both sidebar tree and tab bar

---

## 5. Phase 3: AI Co-Worker Panel (Weeks 5–6)

**Goal:** The AI panel has a working chat interface, agents can analyze session context, generate suggestions, and users can approve/reject PendingChanges that modify workspace data in real time.

### Week 5: Agent Infrastructure + Chat

#### 3.1 Install Agent Framework

```bash
bun add @convex-dev/agents @convex-dev/mastra @ai-sdk/anthropic
```

- Configure `@convex-dev/agents` component in `convex.config.ts`
- Set up Anthropic API key in Convex environment variables
- Create agent definitions with system prompts and tools

#### 3.2 Orchestrator Agent

```typescript
// convex/agents/orchestrator.ts
import { Agent } from "@convex-dev/agents";
import { components } from "../_generated/api";

export const orchestrator = new Agent(components.agents, {
  name: "Orchestrator",
  model: "claude-sonnet-4-20250514",
  instructions: `You are the AI orchestrator for RMINT Restaurant Co-Work.
Your job is to understand what the user needs and route to the appropriate capability agent.

Available capabilities:
- Menu Planning: dish selection, cuisine recommendations, seasonal items
- Cost Optimization: price suggestions, ingredient substitutions, margin improvement
- Demand Forecasting: headcount predictions, peak analysis, trend detection

Analyze the user's message and the current session context, then provide helpful analysis
or route to a specialized capability when needed.

Always reference specific data from the session context when making suggestions.
When suggesting changes, create PendingChange records for user approval.`,

  tools: {
    getSessionContext: {
      description: "Get full context for the current meal session",
      // Bound to convex/agentTools/menuAnalysis.getSessionContext
    },
    createPriceSuggestion: {
      description: "Suggest a price change for a dish in the current session",
      // Bound to convex/agentTools/createSuggestion.createPriceChangeSuggestion
    },
    analyzeCosts: {
      description: "Analyze costs for dishes in the session",
      // Bound to convex/agentTools/costAnalysis.analyzeSessionCosts
    },
  },
});
```

#### 3.3 Menu Planner and Cost Optimizer Agents

- Menu Planner: cuisine recommendations, seasonal awareness, dish pairing
- Cost Optimizer: margin analysis, price suggestions, substitution recommendations
- Each agent has its own system prompt and Convex tools

#### 3.4 Chat Interface

```typescript
// src/components/ai-panel/ChatInterface.tsx
"use client";

import { useAgent } from "@convex-dev/agents/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";

export function ChatInterface({
  sessionId,
}: {
  sessionId: Id<"mealSessions">;
}) {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isRunning } = useAgent({
    agent: "orchestrator",
    context: { sessionId },
  });

  async function handleSend() {
    if (!input.trim() || isRunning) return;
    const message = input;
    setInput("");
    await sendMessage(message);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <ChatBubble key={msg._id} message={msg} />
        ))}
        {isRunning && <TypingIndicator />}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about this meal session..."
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={isRunning || !input.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Week 6: Suggestions + Approval

#### 3.5 Suggestion Chips per Step

- Context-aware suggestion buttons that appear based on the current workflow step:
  - **AI Rules**: "Suggest rules for this cuisine", "Add seasonal preference"
  - **Packaging**: "Optimize prices for 30% margin", "Suggest complementary dishes"
  - **Finances**: "Run what-if: labor +$5/hr", "Find cost savings"
- Clicking a chip sends a pre-built prompt to the orchestrator

#### 3.6 PendingChange Creation from Agents

- When an agent calls `createPriceSuggestion` or similar tools, a PendingChange record is created in Convex
- The AI panel reactively displays new PendingChanges via `useQuery(api.pendingChanges.listPending)`
- Each change renders as a SuggestionCard (from [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md))

#### 3.7 Approval Workflow

- User clicks "Apply" on a SuggestionCard
- `pendingChanges.approve` mutation runs transactionally
- Workspace auto-updates because Convex re-runs affected queries
- Impact badge on the card reflects the change (e.g., "+$450 Revenue")
- Dismissed changes fade from the panel

### Phase 3 Exit Criteria

- [ ] Chat sends messages and receives agent responses
- [ ] Agent can read session context (dishes, prices, financials)
- [ ] Agent can create PendingChange suggestions
- [ ] Suggestions appear as cards in AI panel
- [ ] Apply button modifies workspace data
- [ ] Dismiss button removes suggestion
- [ ] Workspace reflects approved changes immediately (no refresh needed)

---

## 6. Phase 4: Multi-Model + Multimodal (Week 7)

**Goal:** Gemini integration enables food image analysis and recipe content generation. The Recipe Expert agent uses vision capabilities to analyze uploaded food photos and suggest improvements.

### Tasks

#### 4.1 Model Router Configuration

```typescript
// convex/agents/modelRouter.ts
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

export const models = {
  reasoning: anthropic("claude-sonnet-4-20250514"),
  multimodal: google("gemini-2.5-flash"),
};

export function selectModel(task: string) {
  if (task === "image_analysis" || task === "recipe_content" || task === "video_analysis") {
    return models.multimodal;
  }
  return models.reasoning;
}
```

#### 4.2 Gemini Integration

```bash
bun add @ai-sdk/google
```

- Store `GOOGLE_AI_API_KEY` in Convex environment variables
- Configure Gemini 2.5 Flash for multimodal tasks
- Test with sample food image analysis

#### 4.3 Recipe Expert Agent

```typescript
// convex/agents/recipeExpert.ts
import { Agent } from "@convex-dev/agents";
import { components } from "../_generated/api";

export const recipeExpert = new Agent(components.agents, {
  name: "Recipe Expert",
  model: "gemini-2.5-flash",
  instructions: `You are a culinary expert AI assistant for RMINT Restaurant Co-Work.
You specialize in recipe analysis, food photography evaluation, and cooking technique optimization.

When analyzing food images, provide:
1. Visual assessment (plating, color balance, portion appearance)
2. Ingredient identification
3. Estimated preparation complexity
4. Suggestions for improvement

When working with recipes, provide:
1. Technique optimization for restaurant-scale cooking
2. Ingredient substitution recommendations
3. Prep time estimates
4. Cost optimization without quality compromise`,

  tools: {
    analyzeImage: {
      description: "Analyze a food image and provide culinary assessment",
    },
    getRecipeContext: {
      description: "Get recipe details for a specific dish",
    },
    suggestRecipeImprovement: {
      description: "Create a pending change for recipe improvement",
    },
  },
});
```

#### 4.4 Food Image Analysis Pipeline

- Upload food image via Convex Storage
- Pass storage URL to Recipe Expert agent
- Agent returns structured analysis (ingredients, plating score, suggestions)
- Results displayed in Implementation step

#### 4.5 Implementation Step Enhancement

- AI-generated recipe content alongside manual recipes
- Image analysis cards showing plating suggestions
- Side-by-side: current recipe vs. AI-suggested improvements

### Phase 4 Exit Criteria

- [ ] Food image upload triggers Gemini analysis
- [ ] Recipe Expert provides structured feedback on images
- [ ] Model router selects correct model per task
- [ ] Implementation step shows AI-enhanced content
- [ ] Recipe suggestions can be approved as PendingChanges

---

## 7. Phase 5: Proactive Intelligence (Week 8)

**Goal:** Background agents run on Convex scheduled functions, monitoring costs and demand patterns. Proactive alerts appear in the AI panel without user prompting. The Rules Engine filters all suggestions.

### Tasks

#### 5.1 Convex Scheduled Functions Setup

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "monitor-ingredient-costs",
  { hours: 6 },
  internal.agents.costMonitor.checkPriceChanges
);

crons.interval(
  "demand-forecasting-daily",
  { hours: 12 },
  internal.agents.demandForecaster.generateForecasts
);

crons.interval(
  "expire-pending-changes",
  { hours: 1 },
  internal.pendingChanges.expireOldChanges
);

export default crons;
```

#### 5.2 Cost Monitor Agent

- Runs every 6 hours
- Compares current ingredient prices vs. previous prices
- For changes > 10%: creates `cost_alert` proactive alert
- For changes > 20%: also creates ingredient substitution PendingChanges for affected sessions
- Full implementation in [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md) Section 6

#### 5.3 Demand Forecaster Cron

```typescript
// convex/agents/demandForecaster.ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const generateForecasts = internalAction({
  args: {},
  handler: async (ctx) => {
    const upcomingSessions = await ctx.runQuery(
      internal.mealSessions.getUpcomingDraftSessions
    );

    for (const session of upcomingSessions) {
      const historicalData = await ctx.runQuery(
        internal.agentTools.demandAnalysis.getHistoricalDemand,
        {
          restaurantId: session.restaurantId,
          mealType: session.mealType,
          dayOfWeek: new Date(session.date).getDay(),
        }
      );

      if (historicalData.avgHeadcount > 0) {
        const forecast = calculateForecast(historicalData);

        if (Math.abs(forecast.predicted - session.expectedHeadcount) > session.expectedHeadcount * 0.2) {
          await ctx.runMutation(internal.proactiveAlerts.create, {
            restaurantId: session.restaurantId,
            sessionId: session._id,
            agentName: "Demand Forecaster",
            alertType: "demand_update",
            severity: "info",
            title: `${session.date} ${session.mealType}: forecast ${forecast.predicted} covers`,
            message: `Based on ${historicalData.dataPoints} historical ${session.mealType} sessions on similar days, we predict ${forecast.predicted} covers (current setting: ${session.expectedHeadcount}). Confidence: ${forecast.confidence}%.`,
            data: {
              predicted: forecast.predicted,
              current: session.expectedHeadcount,
              confidence: forecast.confidence,
              historicalAvg: historicalData.avgHeadcount,
            },
          });
        }
      }
    }
  },
});

function calculateForecast(data: {
  avgHeadcount: number;
  stdDev: number;
  trend: number;
  dataPoints: number;
}) {
  const predicted = Math.round(data.avgHeadcount * (1 + data.trend));
  const confidence = Math.min(95, Math.round(60 + data.dataPoints * 2));
  return { predicted, confidence };
}
```

#### 5.4 Proactive Alert Cards in AI Panel

- Alerts list above the chat interface
- Badge count on AI panel toggle button
- Color-coded by severity (info=blue, warning=amber, critical=red)
- Mark as read on hover, dismiss button
- Clicking an alert with associated data can pre-fill a chat prompt

#### 5.5 Rules Engine Integration

- Wire `evaluateSuggestion` into agent tool pipeline
- Before creating any PendingChange, agents call the Rules Engine
- Blocked suggestions are logged but not shown to user
- Warned suggestions appear with a warning badge
- Full implementation in [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md) Section 4

### Phase 5 Exit Criteria

- [ ] Cron jobs run on schedule in Convex
- [ ] Cost monitor detects price changes and creates alerts
- [ ] Demand forecaster generates predictions for upcoming sessions
- [ ] Alerts appear in AI panel without user action
- [ ] Rules Engine blocks non-compliant suggestions
- [ ] Warning badges appear on suggestions that partially violate rules

---

## 8. Phase 6: Chain Hierarchy + Collaboration (Week 9)

**Goal:** Multi-restaurant chain management works with cascading settings. Session locking prevents concurrent edits. Neon analytics sync is live. The Financial Analyst agent queries Neon for cross-restaurant insights.

### Tasks

#### 6.1 Multi-Restaurant Chain Management

- Chain settings page: default margin, labor cost, allowed cuisines, max prep time
- Restaurant list with override capability
- Restaurant settings inherit from chain with explicit overrides
- Restaurant switching updates all queries (already in Phase 1 picker)

#### 6.2 Chain Settings Cascading

```typescript
// convex/lib/settings.ts
import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

interface EffectiveSettings {
  marginTarget: number;
  laborCostPerHour: number;
  maxPrepTimeMinutes: number;
  allowedCuisines: string[] | null;
}

export async function getEffectiveSettings(
  ctx: QueryCtx,
  restaurantId: Id<"restaurants">
): Promise<EffectiveSettings> {
  const restaurant = await ctx.db.get(restaurantId);
  if (!restaurant) throw new Error("Restaurant not found");

  const chain = await ctx.db.get(restaurant.chainId);
  if (!chain) throw new Error("Chain not found");

  return {
    marginTarget:
      restaurant.settings.overrideMarginTarget ?? chain.settings.defaultMarginTarget,
    laborCostPerHour: restaurant.laborCostPerHour,
    maxPrepTimeMinutes:
      restaurant.settings.overridePrepTimeLimit ?? chain.settings.maxPrepTimeMinutes,
    allowedCuisines: chain.settings.allowedCuisines ?? null,
  };
}
```

#### 6.3 Session Locking

```typescript
// convex/sessionLocks.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

export const acquireLock = mutation({
  args: { sessionId: v.id("mealSessions") },
  returns: v.object({
    acquired: v.boolean(),
    lockedBy: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("sessionLocks")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      if (existing.expiresAt > now && existing.lockedBy !== identity.subject) {
        return { acquired: false, lockedBy: existing.lockedByName };
      }
      if (existing.lockedBy === identity.subject) {
        await ctx.db.patch(existing._id, {
          heartbeatAt: now,
          expiresAt: now + LOCK_DURATION_MS,
        });
        return { acquired: true };
      }
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("sessionLocks", {
      sessionId: args.sessionId,
      lockedBy: identity.subject,
      lockedByName: identity.name ?? "Unknown",
      lockedAt: now,
      expiresAt: now + LOCK_DURATION_MS,
      heartbeatAt: now,
    });

    return { acquired: true };
  },
});

export const heartbeat = mutation({
  args: { sessionId: v.id("mealSessions") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!lock || lock.lockedBy !== identity.subject) return false;

    await ctx.db.patch(lock._id, {
      heartbeatAt: Date.now(),
      expiresAt: Date.now() + LOCK_DURATION_MS,
    });
    return true;
  },
});

export const releaseLock = mutation({
  args: { sessionId: v.id("mealSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (lock && lock.lockedBy === identity.subject) {
      await ctx.db.delete(lock._id);
    }
  },
});

export const checkLock = query({
  args: { sessionId: v.id("mealSessions") },
  returns: v.union(
    v.object({
      isLocked: v.literal(true),
      lockedByName: v.string(),
      isOwnLock: v.boolean(),
    }),
    v.object({
      isLocked: v.literal(false),
    })
  ),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!lock || lock.expiresAt <= Date.now()) {
      return { isLocked: false as const };
    }

    return {
      isLocked: true as const,
      lockedByName: lock.lockedByName,
      isOwnLock: lock.lockedBy === identity.subject,
    };
  },
});
```

#### 6.4 Neon Analytics Sync Activation

- Enable the `syncSession` action (uncomment scheduler call in `mealSessions.publish`)
- Enable the 15-minute catch-up cron
- Verify data flows from Convex → Neon on publish
- Add `synced_at` indicator on published sessions

#### 6.5 Financial Analyst Agent

```typescript
// convex/agents/financialAnalyst.ts
"use node";

import { internalAction } from "../_generated/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.NEON_DATABASE_URL!);

export const queryWeeklyTrend = internalAction({
  args: {
    restaurantId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await sql`
      SELECT
        date_trunc('week', date) AS week,
        SUM(total_revenue) AS weekly_revenue,
        SUM(profit) AS weekly_profit,
        AVG(prime_cost_pct) AS avg_prime_cost
      FROM analytics_sessions
      WHERE restaurant_id = ${args.restaurantId}
        AND date BETWEEN ${args.startDate}::date AND ${args.endDate}::date
      GROUP BY date_trunc('week', date)
      ORDER BY week
    `;
    return result;
  },
});

export const queryTopDishes = internalAction({
  args: {
    restaurantId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await sql`
      SELECT
        dish_name,
        dish_category,
        COUNT(*) AS times_served,
        SUM(quantity) AS total_units,
        SUM(revenue) AS total_revenue,
        SUM(revenue - cost) AS total_profit,
        AVG(margin_pct) AS avg_margin
      FROM analytics_dish_performance
      WHERE restaurant_id = ${args.restaurantId}
        AND date BETWEEN ${args.startDate}::date AND ${args.endDate}::date
      GROUP BY dish_name, dish_category
      ORDER BY total_profit DESC
      LIMIT ${args.limit ?? 10}
    `;
    return result;
  },
});

export const queryCrossRestaurant = internalAction({
  args: {
    chainId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await sql`
      SELECT
        restaurant_name,
        COUNT(*) AS session_count,
        SUM(total_revenue) AS total_revenue,
        SUM(profit) AS total_profit,
        AVG(prime_cost_pct) AS avg_prime_cost,
        AVG(avg_revenue_per_cover) AS avg_rev_per_cover
      FROM analytics_sessions
      WHERE chain_id = ${args.chainId}
        AND date BETWEEN ${args.startDate}::date AND ${args.endDate}::date
      GROUP BY restaurant_name
      ORDER BY total_profit DESC
    `;
    return result;
  },
});
```

### Phase 6 Exit Criteria

- [ ] Chain settings cascade to restaurants correctly
- [ ] Restaurant overrides take precedence
- [ ] Session locking prevents concurrent edits with clear messaging
- [ ] Lock heartbeat keeps session locked during active editing
- [ ] Published sessions sync to Neon within 15 minutes
- [ ] Financial Analyst returns data from Neon SQL queries
- [ ] Cross-restaurant comparisons work at chain level

---

## 9. Phase 7: Polish + Production (Week 10)

**Goal:** The application is production-ready with comprehensive error handling, responsive design, an analytics dashboard, and optimized performance.

### Tasks

#### 7.1 Error Handling and Edge Cases

- Convex error boundaries: wrap all `useQuery`/`useMutation` calls with error states
- Network disconnection handling: Convex auto-reconnects, add visual indicator
- Concurrent modification conflicts: leverage session locks + optimistic UI
- Empty states: first-time user experience with guided onboarding
- Loading states: skeleton loaders for all data-dependent components
- Form validation: zod schemas on all input forms with inline error messages

```typescript
// src/components/ErrorBoundary.tsx
"use client";

import { useConvexAuth } from "convex/react";

export function ConvexConnectionStatus() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="fixed bottom-4 right-4 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-xs">
        Connecting...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Handled by auth redirect
  }

  return null; // Connected and authenticated
}
```

#### 7.2 Responsive Design

| Breakpoint | Layout | Behavior |
|-----------|--------|----------|
| Desktop (≥1280px) | Three panels side-by-side | Full experience |
| Tablet (768–1279px) | Two panels: Workspace + AI (toggle Calendar) | Calendar as overlay |
| Mobile (<768px) | Single panel with bottom tab navigation | Switch between Calendar, Workspace, AI |

- Use Tailwind responsive classes
- Panel toggle state managed by Jotai atoms
- Bottom navigation bar on mobile with icons for each panel

#### 7.3 Analytics Dashboard

A dedicated `/[restaurantId]/analytics` route with charts powered by Recharts, pulling data from both Convex (recent sessions) and Neon (historical trends).

- **Revenue trend chart** (weekly, line chart with moving average)
- **Prime cost percentage gauge** (current month vs. target)
- **Top dishes by profit** (horizontal bar chart)
- **Meal type comparison** (breakfast vs. lunch vs. dinner, grouped bar)
- **Ingredient cost tracker** (time-series for volatile ingredients)
- Date range selector for all charts

#### 7.4 Performance Optimization

- **Convex query optimization**: ensure all queries use indexes (no `filter()`)
- **Pagination**: implement cursor-based pagination for large dish catalogs and historical session lists
- **Image optimization**: Next.js `<Image>` with proper sizing for Convex Storage URLs
- **Bundle optimization**: dynamic imports for heavy components (Recharts, Calendar)
- **Prefetching**: Convex `preloadQuery` in server components for initial page load

```typescript
// src/app/[restaurantId]/plan/[date]/[meal]/page.tsx
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function MealPage({
  params,
}: {
  params: { restaurantId: string; date: string; meal: string };
}) {
  const preloaded = await preloadQuery(api.mealSessions.getByDateMeal, {
    restaurantId: params.restaurantId as any,
    date: params.date,
    mealType: params.meal as any,
  });

  return <MealSessionContent preloaded={preloaded} />;
}
```

#### 7.5 Production Deployment Configuration

- **Convex**: `npx convex deploy` via CI/CD (already set up in Phase 0)
- **Vercel**: Production deployment with environment variables
- **Neon**: Production branch with connection pooling enabled
- **Monitoring**: Convex dashboard for function logs, Vercel analytics for frontend
- **Environment variables checklist**:
  - `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL
  - `CONVEX_DEPLOY_KEY` — CI/CD deployment key
  - `NEON_DATABASE_URL` — Neon connection string (in Convex env vars)
  - `ANTHROPIC_API_KEY` — Claude API key (in Convex env vars)
  - `GOOGLE_AI_API_KEY` — Gemini API key (in Convex env vars)
  - Auth provider secrets (GitHub, Google OAuth)

### Phase 7 Exit Criteria

- [ ] All error states handled gracefully (no unhandled exceptions)
- [ ] Responsive layout works on desktop, tablet, and mobile
- [ ] Analytics dashboard displays real charts with Neon data
- [ ] Largest Contentful Paint < 2.5s on desktop
- [ ] All queries use indexes (verify in Convex dashboard)
- [ ] Production deployment working end-to-end
- [ ] CI/CD pipeline deploys Convex + Next.js on merge to main

---

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Convex Agent SDK (`@convex-dev/agents`) API changes during development | Medium | High | Pin package version, wrap agent interactions in an abstraction layer, monitor Convex release notes weekly |
| R2 | Gemini multimodal API rate limits or quality variance | Medium | Medium | Implement retry with exponential backoff, cache analysis results, provide fallback text-only mode |
| R3 | Neon sync lag causes stale analytics | Low | Medium | Display "last synced" timestamp, allow manual sync trigger, catch-up cron every 15 minutes |
| R4 | AI suggestion quality is inconsistent | High | High | Rules Engine catches bad suggestions, confidence threshold (hide < 0.5), user feedback loop to improve prompts |
| R5 | Session locking race conditions | Low | High | Convex mutations are serializable — no concurrent lock grants. Heartbeat timeout handles abandoned locks |
| R6 | Large chain with many restaurants hits Convex query limits | Low | Medium | Cursor-based pagination, index-only queries where possible, Convex scales horizontally |
| R7 | PendingChange approval modifies stale data | Medium | Medium | Read-then-write in same Convex transaction ensures consistency; version check on target document |
| R8 | Agent tool calls exceed Convex action timeout (10 min) | Low | Medium | Break large agent tasks into smaller tool calls, use `ctx.scheduler.runAfter` for async work |
| R9 | Complex Neon SQL queries slow for large datasets | Low | Medium | Proper indexes on all analytics tables, `EXPLAIN ANALYZE` in development, materialized views if needed |
| R10 | Team velocity slower than plan | Medium | High | Phases are ordered by dependency — later phases can be descoped. Phase 4 (multimodal) and Phase 6 (chain hierarchy) are independently droppable |

---

## 11. Document Suite Summary

| # | Document | Content | Status |
|---|----------|---------|--------|
| **00** | [00-OVERVIEW.md](./00-OVERVIEW.md) | Executive summary, architecture layers, tech stack, key decisions | Complete |
| **01** | [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md) | Three-panel layout shell, responsive behavior, panel coordination | Planned |
| **02** | [02-CALENDAR-SIDEBAR.md](./02-CALENDAR-SIDEBAR.md) | Calendar widget, date management, session tree, restaurant picker | Planned |
| **03** | [03-WORKSPACE-PANEL.md](./03-WORKSPACE-PANEL.md) | All 5 workflow steps with component specs and Convex queries | Planned |
| **04** | [04-AI-COPANEL.md](./04-AI-COPANEL.md) | AI panel, chat, proactive cards, suggestion chips, Apply workflow | Planned |
| **05** | [05-AGENT-ARCHITECTURE.md](./05-AGENT-ARCHITECTURE.md) | Orchestrator, capability agents, tools, model router, Convex+Mastra | Planned |
| **06** | [06-DATA-LAYER.md](./06-DATA-LAYER.md) | Convex schema, Neon analytics, dual-DB sync, file storage, auth | Complete |
| **07** | [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md) | PendingChange system, Rules Engine, proactive alerts | Complete |
| **08** | [08-IMPLEMENTATION-PHASES.md](./08-IMPLEMENTATION-PHASES.md) (this file) | Sprint-by-sprint build plan with deliverables and risks | Complete |

### Reading Order

For **implementors**, read in this order:
1. `00-OVERVIEW.md` — Understand the big picture
2. `06-DATA-LAYER.md` — Understand data models and schema
3. `07-PENDING-CHANGES-AND-RULES.md` — Understand the AI approval system
4. `08-IMPLEMENTATION-PHASES.md` — Follow the build plan
5. Remaining docs (01–05) as needed during each phase

For **reviewers**, read:
1. `00-OVERVIEW.md` — Architecture summary
2. `08-IMPLEMENTATION-PHASES.md` — Timeline and risks
3. `06-DATA-LAYER.md` — Technical depth

---

*Previous: [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md)*
*Back to: [00-OVERVIEW.md](./00-OVERVIEW.md)*
