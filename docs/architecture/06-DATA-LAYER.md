# 06 — Data Layer: Convex + Neon PostgreSQL

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)

---

## Table of Contents

1. [Dual Database Architecture](#1-dual-database-architecture)
2. [Convex Schema](#2-convex-schema)
3. [Convex Queries and Mutations](#3-convex-queries-and-mutations)
4. [Neon PostgreSQL Schema](#4-neon-postgresql-schema)
5. [Convex → Neon Sync](#5-convex--neon-sync)
6. [File Storage](#6-file-storage)
7. [Authentication](#7-authentication)
8. [File Structure](#8-file-structure)

---

## 1. Dual Database Architecture

### Why Two Databases

**Convex** is the primary data store for everything the application renders in real time. It provides reactive queries (data pushed to clients on change), serverless functions (queries, mutations, actions), integrated file storage, and scheduled functions — all with zero boilerplate. There are no API routes to write, no React Query to configure, no cache invalidation to manage, and no WebSocket infrastructure to maintain.

**Neon PostgreSQL** is the analytics layer for queries that require complex SQL: multi-table JOINs with GROUP BY aggregations, window functions for moving averages, cross-restaurant comparisons over arbitrary date ranges, and seasonal pattern detection. These analytical queries run against denormalized, pre-aggregated data that is synced from Convex on a schedule.

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                              │
│                                                                      │
│  useQuery(api.sessions.get)     useMutation(api.dishes.updatePrice)  │
│         │                                │                           │
│         │  reactive subscription         │  optimistic update        │
│         ▼                                ▼                           │
├──────────────────────────────────────────────────────────────────────┤
│                        CONVEX (Primary)                              │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Queries     │  │  Mutations   │  │  Actions     │               │
│  │  (reactive)  │  │  (ACID)      │  │  (side fx)   │               │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                │                  │                        │
│         ▼                ▼                  ▼                        │
│  ┌──────────────────────────────────────────────────┐               │
│  │              Convex Document Store                │               │
│  │                                                   │               │
│  │  chains · restaurants · mealSessions              │               │
│  │  sessionMenus · sessionDishes · sessionFinancials │               │
│  │  menuTemplates · dishes · dishIngredients         │               │
│  │  ingredients · recipes · aiRules                  │               │
│  │  pendingChanges · proactiveAlerts · sessionLocks  │               │
│  │  agent_threads · agent_messages                   │               │
│  └──────────────────────┬───────────────────────────┘               │
│                         │                                            │
│         Convex Storage  │  Scheduled Sync                            │
│  ┌──────────────┐       │  (every 15 min +                          │
│  │ Food images  │       │   on session publish)                      │
│  │ Recipe videos│       │                                            │
│  └──────────────┘       ▼                                            │
├──────────────────────────────────────────────────────────────────────┤
│                     NEON POSTGRESQL (Analytics)                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐               │
│  │  analytics_sessions                               │               │
│  │  analytics_dish_performance                       │               │
│  │  analytics_ingredient_costs                       │               │
│  │  analytics_daily_summary                          │               │
│  └──────────────────────────────────────────────────┘               │
│         ▲                                                            │
│         │  SQL queries via @neondatabase/serverless                  │
│         │                                                            │
│  Financial Analyst Agent (Convex action with "use node")            │
└──────────────────────────────────────────────────────────────────────┘
```

### Decision Matrix

| Concern | Convex | Neon PostgreSQL |
|---------|--------|-----------------|
| Real-time subscriptions | Yes (built-in) | No |
| Reactive UI updates | Yes (automatic) | No |
| ACID transactions | Yes (serializable) | Yes |
| Complex JOINs | Limited (manual) | Yes (full SQL) |
| Window functions | No | Yes |
| GROUP BY aggregations | Manual (in code) | Yes (native SQL) |
| File storage | Yes (built-in) | No |
| Scheduled functions | Yes (built-in) | Requires external cron |
| Agent tool integration | Direct (same runtime) | Via action with node driver |

---

## 2. Convex Schema

The complete schema defines every table, field, and index used by the application. Convex enforces this schema at write time — any mutation that writes data not matching the schema will fail.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ═══════════════════════════════════════════════════════════════════
  // ORGANIZATION
  // ═══════════════════════════════════════════════════════════════════

  chains: defineTable({
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    defaultCurrency: v.string(),
    defaultTimezone: v.string(),
    settings: v.object({
      defaultMarginTarget: v.number(),
      defaultLaborCostPerHour: v.number(),
      maxPrepTimeMinutes: v.number(),
      allowedCuisines: v.optional(v.array(v.string())),
    }),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  restaurants: defineTable({
    chainId: v.id("chains"),
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    timezone: v.string(),
    seatingCapacity: v.number(),
    avgDailyCovers: v.number(),
    laborCostPerHour: v.number(),
    settings: v.object({
      overrideMarginTarget: v.optional(v.number()),
      overridePrepTimeLimit: v.optional(v.number()),
      operatingHours: v.object({
        breakfast: v.object({ start: v.string(), end: v.string() }),
        lunch: v.object({ start: v.string(), end: v.string() }),
        dinner: v.object({ start: v.string(), end: v.string() }),
      }),
    }),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_chain", ["chainId"])
    .index("by_chain_slug", ["chainId", "slug"])
    .index("by_chain_active", ["chainId", "isActive"]),

  // ═══════════════════════════════════════════════════════════════════
  // MEAL SESSION PLANNING
  // ═══════════════════════════════════════════════════════════════════

  mealSessions: defineTable({
    restaurantId: v.id("restaurants"),
    date: v.string(),
    mealType: v.union(
      v.literal("breakfast"),
      v.literal("lunch"),
      v.literal("dinner")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("planning"),
      v.literal("review"),
      v.literal("published"),
      v.literal("archived")
    ),
    currentStep: v.union(
      v.literal("ai_rules"),
      v.literal("packaging"),
      v.literal("implementation"),
      v.literal("finances"),
      v.literal("menu")
    ),
    expectedHeadcount: v.number(),
    notes: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    publishedBy: v.optional(v.string()),
    syncedToNeonAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_restaurant_date", ["restaurantId", "date"])
    .index("by_restaurant_date_meal", ["restaurantId", "date", "mealType"])
    .index("by_restaurant_status", ["restaurantId", "status"])
    .index("by_status", ["status"])
    .index("by_date_range", ["date"]),

  sessionMenus: defineTable({
    sessionId: v.id("mealSessions"),
    menuTemplateId: v.id("menuTemplates"),
    position: v.number(),
    isSelected: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_selected", ["sessionId", "isSelected"]),

  sessionDishes: defineTable({
    sessionId: v.id("mealSessions"),
    sessionMenuId: v.id("sessionMenus"),
    dishId: v.id("dishes"),
    overridePrice: v.optional(v.number()),
    overridePortionSize: v.optional(v.string()),
    quantity: v.number(),
    position: v.number(),
    isIncluded: v.boolean(),
    aiSuggested: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_menu", ["sessionMenuId"])
    .index("by_session_included", ["sessionId", "isIncluded"])
    .index("by_dish", ["dishId"]),

  sessionFinancials: defineTable({
    sessionId: v.id("mealSessions"),
    laborCostTotal: v.number(),
    ingredientCostTotal: v.number(),
    overheadCostTotal: v.number(),
    projectedRevenue: v.number(),
    projectedProfit: v.number(),
    primeCostPercentage: v.number(),
    foodCostPercentage: v.number(),
    laborCostPercentage: v.number(),
    avgRevenuePerCover: v.number(),
    breakEvenCovers: v.number(),
    customCosts: v.array(
      v.object({
        label: v.string(),
        amount: v.number(),
        category: v.union(
          v.literal("labor"),
          v.literal("ingredient"),
          v.literal("overhead"),
          v.literal("other")
        ),
      })
    ),
    scenarioSnapshots: v.optional(
      v.array(
        v.object({
          label: v.string(),
          revenue: v.number(),
          profit: v.number(),
          primeCost: v.number(),
          createdAt: v.number(),
        })
      )
    ),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"]),

  // ═══════════════════════════════════════════════════════════════════
  // CATALOG: MENUS, DISHES, INGREDIENTS, RECIPES
  // ═══════════════════════════════════════════════════════════════════

  menuTemplates: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    description: v.optional(v.string()),
    cuisineType: v.string(),
    mealType: v.union(
      v.literal("breakfast"),
      v.literal("lunch"),
      v.literal("dinner"),
      v.literal("all")
    ),
    isActive: v.boolean(),
    coverImageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_meal", ["restaurantId", "mealType"])
    .index("by_restaurant_cuisine", ["restaurantId", "cuisineType"])
    .index("by_restaurant_active", ["restaurantId", "isActive"]),

  dishes: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal("appetizer"),
      v.literal("main"),
      v.literal("side"),
      v.literal("dessert"),
      v.literal("beverage"),
      v.literal("special")
    ),
    cuisineType: v.string(),
    basePrice: v.number(),
    costPerServing: v.number(),
    prepTimeMinutes: v.number(),
    portionSize: v.string(),
    allergens: v.array(v.string()),
    dietaryTags: v.array(v.string()),
    isSeasonalItem: v.boolean(),
    seasonalAvailability: v.optional(
      v.object({
        startMonth: v.number(),
        endMonth: v.number(),
      })
    ),
    imageStorageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_category", ["restaurantId", "category"])
    .index("by_restaurant_cuisine", ["restaurantId", "cuisineType"])
    .index("by_restaurant_active", ["restaurantId", "isActive"]),

  dishIngredients: defineTable({
    dishId: v.id("dishes"),
    ingredientId: v.id("ingredients"),
    quantityPerServing: v.number(),
    unit: v.string(),
    isOptional: v.boolean(),
  })
    .index("by_dish", ["dishId"])
    .index("by_ingredient", ["ingredientId"]),

  ingredients: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    category: v.union(
      v.literal("protein"),
      v.literal("produce"),
      v.literal("dairy"),
      v.literal("grain"),
      v.literal("spice"),
      v.literal("oil_fat"),
      v.literal("condiment"),
      v.literal("other")
    ),
    unit: v.string(),
    currentPricePerUnit: v.number(),
    previousPricePerUnit: v.optional(v.number()),
    priceLastUpdated: v.number(),
    supplier: v.optional(v.string()),
    isLocal: v.boolean(),
    isOrganic: v.boolean(),
    shelfLifeDays: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_category", ["restaurantId", "category"])
    .index("by_restaurant_name", ["restaurantId", "name"]),

  recipes: defineTable({
    dishId: v.id("dishes"),
    instructions: v.string(),
    prepSteps: v.array(
      v.object({
        stepNumber: v.number(),
        description: v.string(),
        durationMinutes: v.number(),
        imageStorageId: v.optional(v.id("_storage")),
      })
    ),
    videoStorageId: v.optional(v.id("_storage")),
    chefNotes: v.optional(v.string()),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard")
    ),
    servings: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dish", ["dishId"]),

  // ═══════════════════════════════════════════════════════════════════
  // AI RULES
  // ═══════════════════════════════════════════════════════════════════

  aiRules: defineTable({
    scope: v.union(
      v.literal("chain"),
      v.literal("restaurant"),
      v.literal("session")
    ),
    scopeId: v.string(),
    ruleType: v.union(
      v.literal("cuisine_filter"),
      v.literal("margin_threshold"),
      v.literal("prep_time_limit"),
      v.literal("headcount_min"),
      v.literal("seasonal_preference"),
      v.literal("dietary_restriction"),
      v.literal("custom")
    ),
    label: v.string(),
    description: v.optional(v.string()),
    config: v.object({
      operator: v.optional(
        v.union(
          v.literal("eq"),
          v.literal("neq"),
          v.literal("gt"),
          v.literal("gte"),
          v.literal("lt"),
          v.literal("lte"),
          v.literal("in"),
          v.literal("not_in"),
          v.literal("contains"),
          v.literal("custom_eval")
        )
      ),
      field: v.optional(v.string()),
      value: v.optional(v.any()),
      customExpression: v.optional(v.string()),
    }),
    priority: v.number(),
    isActive: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope", ["scope", "scopeId"])
    .index("by_scope_type", ["scope", "scopeId", "ruleType"])
    .index("by_scope_active", ["scope", "scopeId", "isActive"]),

  // ═══════════════════════════════════════════════════════════════════
  // AI INTERACTION: PENDING CHANGES + PROACTIVE ALERTS
  // ═══════════════════════════════════════════════════════════════════

  pendingChanges: defineTable({
    sessionId: v.id("mealSessions"),
    agentName: v.string(),
    threadId: v.optional(v.string()),
    changeType: v.union(
      v.literal("price_change"),
      v.literal("menu_swap"),
      v.literal("ingredient_sub"),
      v.literal("rule_add"),
      v.literal("quantity_adjust"),
      v.literal("cost_alert")
    ),
    targetTable: v.string(),
    targetId: v.optional(v.string()),
    description: v.string(),
    reasoning: v.string(),
    beforeState: v.optional(v.any()),
    afterState: v.any(),
    impact: v.optional(
      v.object({
        revenueChange: v.optional(v.number()),
        profitChange: v.optional(v.number()),
        costChange: v.optional(v.number()),
        marginChange: v.optional(v.number()),
      })
    ),
    confidence: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_status", ["sessionId", "status"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  proactiveAlerts: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.optional(v.id("mealSessions")),
    agentName: v.string(),
    alertType: v.union(
      v.literal("cost_alert"),
      v.literal("optimization"),
      v.literal("demand_update"),
      v.literal("menu_suggestion")
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
    isRead: v.boolean(),
    isDismissed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_unread", ["restaurantId", "isRead"])
    .index("by_session", ["sessionId"])
    .index("by_type", ["alertType"]),

  // ═══════════════════════════════════════════════════════════════════
  // COLLABORATION
  // ═══════════════════════════════════════════════════════════════════

  sessionLocks: defineTable({
    sessionId: v.id("mealSessions"),
    lockedBy: v.string(),
    lockedByName: v.string(),
    lockedAt: v.number(),
    expiresAt: v.number(),
    heartbeatAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_expires", ["expiresAt"]),

  // ═══════════════════════════════════════════════════════════════════
  // AGENT FRAMEWORK (@convex-dev/agents)
  //
  // These tables are created by the agents component installation.
  // Listed here for reference — do NOT define them manually; they are
  // managed by the component via `app.use(agents)` in convex.config.ts.
  //
  //   agents:threads    — conversation threads per agent + user
  //   agents:messages   — individual messages within threads
  //   agents:steps      — tool call steps, intermediate reasoning
  //   agents:running    — currently executing agent runs
  //
  // ═══════════════════════════════════════════════════════════════════
});
```

### Entity Relationship Overview

```
chains ──< restaurants ──< mealSessions ──< sessionMenus ──< sessionDishes
                │                 │                               │
                │                 ├──< sessionFinancials          │
                │                 ├──< pendingChanges             ▼
                │                 ├──< sessionLocks          dishes ──< dishIngredients >── ingredients
                │                 └──< proactiveAlerts            │
                │                                                 └──< recipes
                ├──< menuTemplates
                ├──< ingredients
                └──< dishes

aiRules (polymorphic scope: chain | restaurant | session)
proactiveAlerts (polymorphic: restaurant-wide or session-specific)
```

### Index Design Rationale

Every index maps to a specific query pattern used by the UI or agents:

| Table | Index | Used By |
|-------|-------|---------|
| `mealSessions` | `by_restaurant_date` | Calendar sidebar — show sessions for a date range |
| `mealSessions` | `by_restaurant_date_meal` | Direct lookup — load a specific meal session |
| `sessionDishes` | `by_session_included` | Packaging step — list included dishes |
| `dishes` | `by_restaurant_cuisine` | Menu Planner agent — filter by cuisine |
| `aiRules` | `by_scope_active` | Rules Engine — load active rules for evaluation |
| `pendingChanges` | `by_session_status` | AI panel — show pending suggestions for session |
| `proactiveAlerts` | `by_restaurant_unread` | AI panel — badge count + alert list |
| `sessionLocks` | `by_session` | Collaboration — check if session is locked |

---

## 3. Convex Queries and Mutations

Convex eliminates the entire API layer. A query defined on the server is called directly from the client with `useQuery`, and the component re-renders automatically whenever the underlying data changes. No API routes, no React Query, no cache invalidation, no WebSocket setup.

### Query Pattern: List Session Dishes

```typescript
// convex/sessionDishes.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: {
    sessionId: v.id("mealSessions"),
    includedOnly: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("sessionDishes"),
      dishId: v.id("dishes"),
      dishName: v.string(),
      dishCategory: v.string(),
      basePrice: v.number(),
      overridePrice: v.optional(v.number()),
      effectivePrice: v.number(),
      quantity: v.number(),
      position: v.number(),
      isIncluded: v.boolean(),
      costPerServing: v.number(),
      margin: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const sessionDishes = args.includedOnly
      ? await ctx.db
          .query("sessionDishes")
          .withIndex("by_session_included", (q) =>
            q.eq("sessionId", args.sessionId).eq("isIncluded", true)
          )
          .collect()
      : await ctx.db
          .query("sessionDishes")
          .withIndex("by_session", (q) =>
            q.eq("sessionId", args.sessionId)
          )
          .collect();

    const enriched = await Promise.all(
      sessionDishes.map(async (sd) => {
        const dish = await ctx.db.get(sd.dishId);
        if (!dish) throw new Error(`Dish ${sd.dishId} not found`);
        const effectivePrice = sd.overridePrice ?? dish.basePrice;
        const margin =
          effectivePrice > 0
            ? ((effectivePrice - dish.costPerServing) / effectivePrice) * 100
            : 0;

        return {
          _id: sd._id,
          dishId: sd.dishId,
          dishName: dish.name,
          dishCategory: dish.category,
          basePrice: dish.basePrice,
          overridePrice: sd.overridePrice,
          effectivePrice,
          quantity: sd.quantity,
          position: sd.position,
          isIncluded: sd.isIncluded,
          costPerServing: dish.costPerServing,
          margin: Math.round(margin * 100) / 100,
        };
      })
    );

    return enriched.sort((a, b) => a.position - b.position);
  },
});
```

### Client Usage: Zero Boilerplate

```typescript
// app/[restaurantId]/plan/[date]/[meal]/packaging/page.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function PackagingStep({
  sessionId,
}: {
  sessionId: Id<"mealSessions">;
}) {
  // Reactive — auto-updates when any sessionDish changes
  const dishes = useQuery(api.sessionDishes.listBySession, {
    sessionId,
    includedOnly: false,
  });

  // Mutation — no invalidateQueries, no onSuccess refetch
  const updatePrice = useMutation(api.sessionDishes.updatePrice);

  if (dishes === undefined) return <LoadingSkeleton />;

  return (
    <CostTable
      dishes={dishes}
      onPriceChange={(dishId, newPrice) =>
        updatePrice({ sessionDishId: dishId, newPrice })
      }
    />
  );
}
```

### Mutation Pattern: Update Price

```typescript
// convex/sessionDishes.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const updatePrice = mutation({
  args: {
    sessionDishId: v.id("sessionDishes"),
    newPrice: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const sessionDish = await ctx.db.get(args.sessionDishId);
    if (!sessionDish) throw new Error("Session dish not found");

    const session = await ctx.db.get(sessionDish.sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status === "published") {
      throw new Error("Cannot modify a published session");
    }

    await ctx.db.patch(args.sessionDishId, {
      overridePrice: args.newPrice,
      updatedAt: Date.now(),
    });

    await recalculateSessionFinancials(ctx, sessionDish.sessionId);
  },
});

async function recalculateSessionFinancials(
  ctx: { db: any },
  sessionId: Id<"mealSessions">
) {
  const dishes = await ctx.db
    .query("sessionDishes")
    .withIndex("by_session_included", (q: any) =>
      q.eq("sessionId", sessionId).eq("isIncluded", true)
    )
    .collect();

  let totalRevenue = 0;
  let totalIngredientCost = 0;

  for (const sd of dishes) {
    const dish = await ctx.db.get(sd.dishId);
    if (!dish) continue;
    const price = sd.overridePrice ?? dish.basePrice;
    totalRevenue += price * sd.quantity;
    totalIngredientCost += dish.costPerServing * sd.quantity;
  }

  const session = await ctx.db.get(sessionId);
  if (!session) return;

  const financials = await ctx.db
    .query("sessionFinancials")
    .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
    .unique();

  if (financials) {
    const profit = totalRevenue - totalIngredientCost - financials.laborCostTotal - financials.overheadCostTotal;
    const primeCost = totalRevenue > 0
      ? ((totalIngredientCost + financials.laborCostTotal) / totalRevenue) * 100
      : 0;

    await ctx.db.patch(financials._id, {
      ingredientCostTotal: totalIngredientCost,
      projectedRevenue: totalRevenue,
      projectedProfit: profit,
      primeCostPercentage: Math.round(primeCost * 100) / 100,
      foodCostPercentage:
        totalRevenue > 0
          ? Math.round((totalIngredientCost / totalRevenue) * 10000) / 100
          : 0,
      avgRevenuePerCover:
        session.expectedHeadcount > 0
          ? Math.round((totalRevenue / session.expectedHeadcount) * 100) / 100
          : 0,
      updatedAt: Date.now(),
    });
  }
}
```

### Query Pattern: Calendar Sessions

```typescript
// convex/mealSessions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listByDateRange = query({
  args: {
    restaurantId: v.id("restaurants"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("mealSessions"),
      date: v.string(),
      mealType: v.string(),
      status: v.string(),
      currentStep: v.string(),
      expectedHeadcount: v.number(),
      dishCount: v.number(),
      hasPendingChanges: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("mealSessions")
      .withIndex("by_restaurant_date", (q) =>
        q
          .eq("restaurantId", args.restaurantId)
          .gte("date", args.startDate)
          .lte("date", args.endDate)
      )
      .collect();

    return Promise.all(
      sessions.map(async (session) => {
        const dishes = await ctx.db
          .query("sessionDishes")
          .withIndex("by_session_included", (q) =>
            q.eq("sessionId", session._id).eq("isIncluded", true)
          )
          .collect();

        const pendingChanges = await ctx.db
          .query("pendingChanges")
          .withIndex("by_session_status", (q) =>
            q.eq("sessionId", session._id).eq("status", "pending")
          )
          .collect();

        return {
          _id: session._id,
          date: session.date,
          mealType: session.mealType,
          status: session.status,
          currentStep: session.currentStep,
          expectedHeadcount: session.expectedHeadcount,
          dishCount: dishes.length,
          hasPendingChanges: pendingChanges.length > 0,
        };
      })
    );
  },
});
```

### Internal Function Pattern: Agent Tools

Agent tools are Convex `internalAction` / `internalMutation` / `internalQuery` functions. They are not exposed to the client but are callable by agents running inside Convex.

```typescript
// convex/agentTools/menuAnalysis.ts
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getSessionContext = internalQuery({
  args: { sessionId: v.id("mealSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const restaurant = await ctx.db.get(session.restaurantId);
    const dishes = await ctx.db
      .query("sessionDishes")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const financials = await ctx.db
      .query("sessionFinancials")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    const rules = await ctx.db
      .query("aiRules")
      .withIndex("by_scope_active", (q) =>
        q
          .eq("scope", "session")
          .eq("scopeId", args.sessionId)
          .eq("isActive", true)
      )
      .collect();

    const enrichedDishes = await Promise.all(
      dishes.map(async (sd) => {
        const dish = await ctx.db.get(sd.dishId);
        return { ...sd, dish };
      })
    );

    return {
      session,
      restaurant,
      dishes: enrichedDishes,
      financials,
      rules,
    };
  },
});
```

---

## 4. Neon PostgreSQL Schema

The analytics database stores denormalized, pre-aggregated data synced from Convex. It is optimized for complex SQL queries that power the Financial Analyst agent and analytics dashboard.

### DDL

```sql
-- analytics_sessions: one row per published meal session
CREATE TABLE analytics_sessions (
  id              TEXT PRIMARY KEY,         -- Convex session _id
  restaurant_id   TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  chain_id        TEXT NOT NULL,
  chain_name      TEXT NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT NOT NULL,             -- breakfast | lunch | dinner
  expected_headcount INTEGER NOT NULL,
  actual_headcount   INTEGER,               -- filled in post-service
  dish_count      INTEGER NOT NULL,
  total_revenue   NUMERIC(12,2) NOT NULL,
  total_cost      NUMERIC(12,2) NOT NULL,
  labor_cost      NUMERIC(12,2) NOT NULL,
  ingredient_cost NUMERIC(12,2) NOT NULL,
  overhead_cost   NUMERIC(12,2) NOT NULL,
  profit          NUMERIC(12,2) NOT NULL,
  prime_cost_pct  NUMERIC(5,2) NOT NULL,
  food_cost_pct   NUMERIC(5,2) NOT NULL,
  avg_revenue_per_cover NUMERIC(8,2) NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_restaurant_date ON analytics_sessions (restaurant_id, date);
CREATE INDEX idx_sessions_chain_date ON analytics_sessions (chain_id, date);
CREATE INDEX idx_sessions_date ON analytics_sessions (date);
CREATE INDEX idx_sessions_meal ON analytics_sessions (meal_type);

-- analytics_dish_performance: one row per dish per session
CREATE TABLE analytics_dish_performance (
  id              TEXT PRIMARY KEY,          -- Convex sessionDish _id
  session_id      TEXT NOT NULL REFERENCES analytics_sessions(id),
  restaurant_id   TEXT NOT NULL,
  dish_id         TEXT NOT NULL,
  dish_name       TEXT NOT NULL,
  dish_category   TEXT NOT NULL,
  cuisine_type    TEXT NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT NOT NULL,
  price           NUMERIC(8,2) NOT NULL,
  cost_per_serving NUMERIC(8,2) NOT NULL,
  quantity        INTEGER NOT NULL,
  revenue         NUMERIC(12,2) NOT NULL,    -- price × quantity
  cost            NUMERIC(12,2) NOT NULL,    -- cost_per_serving × quantity
  margin_pct      NUMERIC(5,2) NOT NULL,
  was_ai_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dish_perf_restaurant ON analytics_dish_performance (restaurant_id, date);
CREATE INDEX idx_dish_perf_dish ON analytics_dish_performance (dish_id, date);
CREATE INDEX idx_dish_perf_category ON analytics_dish_performance (dish_category, date);
CREATE INDEX idx_dish_perf_cuisine ON analytics_dish_performance (cuisine_type, date);
CREATE INDEX idx_dish_perf_session ON analytics_dish_performance (session_id);

-- analytics_ingredient_costs: time-series of ingredient price changes
CREATE TABLE analytics_ingredient_costs (
  id              SERIAL PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  ingredient_id   TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  category        TEXT NOT NULL,
  unit            TEXT NOT NULL,
  price_per_unit  NUMERIC(10,4) NOT NULL,
  previous_price  NUMERIC(10,4),
  price_change_pct NUMERIC(6,2),
  supplier        TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingredient_costs_restaurant ON analytics_ingredient_costs (restaurant_id, recorded_at);
CREATE INDEX idx_ingredient_costs_ingredient ON analytics_ingredient_costs (ingredient_id, recorded_at);
CREATE INDEX idx_ingredient_costs_category ON analytics_ingredient_costs (category, recorded_at);

-- analytics_daily_summary: one row per restaurant per day (aggregate)
CREATE TABLE analytics_daily_summary (
  id              SERIAL PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  chain_id        TEXT NOT NULL,
  date            DATE NOT NULL,
  total_sessions  INTEGER NOT NULL,
  total_revenue   NUMERIC(12,2) NOT NULL,
  total_cost      NUMERIC(12,2) NOT NULL,
  total_profit    NUMERIC(12,2) NOT NULL,
  avg_prime_cost_pct NUMERIC(5,2) NOT NULL,
  total_covers    INTEGER NOT NULL,
  avg_revenue_per_cover NUMERIC(8,2) NOT NULL,
  top_dish_id     TEXT,
  top_dish_name   TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, date)
);

CREATE INDEX idx_daily_summary_restaurant ON analytics_daily_summary (restaurant_id, date);
CREATE INDEX idx_daily_summary_chain ON analytics_daily_summary (chain_id, date);
```

### Example Analytics Queries

The Financial Analyst agent executes these queries against Neon when asked about trends, comparisons, and forecasts.

**Weekly revenue trend with moving average:**

```sql
SELECT
  date_trunc('week', date) AS week,
  SUM(total_revenue) AS weekly_revenue,
  SUM(profit) AS weekly_profit,
  AVG(prime_cost_pct) AS avg_prime_cost,
  AVG(SUM(total_revenue)) OVER (
    ORDER BY date_trunc('week', date)
    ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
  ) AS revenue_4wk_moving_avg
FROM analytics_sessions
WHERE restaurant_id = $1
  AND date BETWEEN $2 AND $3
GROUP BY date_trunc('week', date)
ORDER BY week;
```

**Top performing dishes by profit contribution:**

```sql
SELECT
  dish_name,
  dish_category,
  cuisine_type,
  COUNT(*) AS times_served,
  SUM(quantity) AS total_units,
  SUM(revenue) AS total_revenue,
  SUM(revenue - cost) AS total_profit,
  AVG(margin_pct) AS avg_margin,
  SUM(revenue - cost) / NULLIF(SUM(revenue), 0) * 100 AS profit_contribution_pct
FROM analytics_dish_performance
WHERE restaurant_id = $1
  AND date BETWEEN $2 AND $3
GROUP BY dish_name, dish_category, cuisine_type
ORDER BY total_profit DESC
LIMIT 20;
```

**Ingredient cost volatility (items with >10% price change):**

```sql
WITH latest_prices AS (
  SELECT DISTINCT ON (ingredient_id)
    ingredient_id,
    ingredient_name,
    category,
    price_per_unit AS current_price,
    previous_price,
    price_change_pct,
    recorded_at
  FROM analytics_ingredient_costs
  WHERE restaurant_id = $1
  ORDER BY ingredient_id, recorded_at DESC
)
SELECT
  ingredient_name,
  category,
  current_price,
  previous_price,
  price_change_pct,
  recorded_at
FROM latest_prices
WHERE ABS(price_change_pct) > 10
ORDER BY ABS(price_change_pct) DESC;
```

**Cross-restaurant comparison (chain-level):**

```sql
SELECT
  s.restaurant_name,
  COUNT(*) AS session_count,
  SUM(s.total_revenue) AS total_revenue,
  SUM(s.profit) AS total_profit,
  AVG(s.prime_cost_pct) AS avg_prime_cost,
  AVG(s.avg_revenue_per_cover) AS avg_rev_per_cover,
  SUM(s.expected_headcount) AS total_covers
FROM analytics_sessions s
WHERE s.chain_id = $1
  AND s.date BETWEEN $2 AND $3
GROUP BY s.restaurant_name
ORDER BY total_profit DESC;
```

---

## 5. Convex → Neon Sync

Published session data is synced to Neon PostgreSQL via a Convex action that uses `@neondatabase/serverless` inside a `"use node"` context. The sync runs on two triggers: (1) immediately when a session is published, and (2) on a 15-minute cron as a catch-up sweep.

### Sync Action

```typescript
// convex/sync/analyticsSync.ts
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.NEON_DATABASE_URL!);

export const syncSession = internalAction({
  args: { sessionId: v.id("mealSessions") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.sync.analyticsSyncHelpers.getSessionForSync,
      { sessionId: args.sessionId }
    );

    if (!context) {
      console.log(`Session ${args.sessionId} not found or not published`);
      return;
    }

    const { session, restaurant, chain, dishes, financials } = context;

    await sql`
      INSERT INTO analytics_sessions (
        id, restaurant_id, restaurant_name, chain_id, chain_name,
        date, meal_type, expected_headcount, dish_count,
        total_revenue, total_cost, labor_cost, ingredient_cost, overhead_cost,
        profit, prime_cost_pct, food_cost_pct, avg_revenue_per_cover,
        published_at, created_at
      ) VALUES (
        ${session._id}, ${restaurant._id}, ${restaurant.name},
        ${chain._id}, ${chain.name},
        ${session.date}, ${session.mealType}, ${session.expectedHeadcount},
        ${dishes.length},
        ${financials.projectedRevenue}, ${financials.ingredientCostTotal + financials.laborCostTotal + financials.overheadCostTotal},
        ${financials.laborCostTotal}, ${financials.ingredientCostTotal}, ${financials.overheadCostTotal},
        ${financials.projectedProfit}, ${financials.primeCostPercentage}, ${financials.foodCostPercentage},
        ${financials.avgRevenuePerCover},
        to_timestamp(${session.publishedAt! / 1000}),
        to_timestamp(${session.createdAt / 1000})
      )
      ON CONFLICT (id) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_cost = EXCLUDED.total_cost,
        profit = EXCLUDED.profit,
        prime_cost_pct = EXCLUDED.prime_cost_pct,
        synced_at = NOW()
    `;

    for (const sd of dishes) {
      const effectivePrice = sd.overridePrice ?? sd.dish.basePrice;
      const revenue = effectivePrice * sd.quantity;
      const cost = sd.dish.costPerServing * sd.quantity;
      const marginPct =
        effectivePrice > 0
          ? ((effectivePrice - sd.dish.costPerServing) / effectivePrice) * 100
          : 0;

      await sql`
        INSERT INTO analytics_dish_performance (
          id, session_id, restaurant_id, dish_id, dish_name,
          dish_category, cuisine_type, date, meal_type,
          price, cost_per_serving, quantity, revenue, cost,
          margin_pct, was_ai_suggested
        ) VALUES (
          ${sd._id}, ${session._id}, ${restaurant._id},
          ${sd.dishId}, ${sd.dish.name},
          ${sd.dish.category}, ${sd.dish.cuisineType},
          ${session.date}, ${session.mealType},
          ${effectivePrice}, ${sd.dish.costPerServing},
          ${sd.quantity}, ${revenue}, ${cost},
          ${Math.round(marginPct * 100) / 100}, ${sd.aiSuggested}
        )
        ON CONFLICT (id) DO UPDATE SET
          price = EXCLUDED.price,
          quantity = EXCLUDED.quantity,
          revenue = EXCLUDED.revenue,
          cost = EXCLUDED.cost,
          margin_pct = EXCLUDED.margin_pct,
          synced_at = NOW()
      `;
    }

    await ctx.runMutation(
      internal.sync.analyticsSyncHelpers.markSynced,
      { sessionId: args.sessionId }
    );
  },
});

export const syncUnsyncedSessions = internalAction({
  args: {},
  handler: async (ctx) => {
    const unsyncedIds = await ctx.runQuery(
      internal.sync.analyticsSyncHelpers.getUnsyncedSessionIds
    );

    for (const sessionId of unsyncedIds) {
      await ctx.runAction(internal.sync.analyticsSync.syncSession, {
        sessionId,
      });
    }
  },
});
```

### Sync Helper Queries

```typescript
// convex/sync/analyticsSyncHelpers.ts
import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const getSessionForSync = internalQuery({
  args: { sessionId: v.id("mealSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "published") return null;

    const restaurant = await ctx.db.get(session.restaurantId);
    if (!restaurant) return null;

    const chain = await ctx.db.get(restaurant.chainId);
    if (!chain) return null;

    const sessionDishes = await ctx.db
      .query("sessionDishes")
      .withIndex("by_session_included", (q) =>
        q.eq("sessionId", args.sessionId).eq("isIncluded", true)
      )
      .collect();

    const dishes = await Promise.all(
      sessionDishes.map(async (sd) => {
        const dish = await ctx.db.get(sd.dishId);
        return { ...sd, dish: dish! };
      })
    );

    const financials = await ctx.db
      .query("sessionFinancials")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!financials) return null;

    return { session, restaurant, chain, dishes, financials };
  },
});

export const getUnsyncedSessionIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const published = await ctx.db
      .query("mealSessions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    return published
      .filter((s) => !s.syncedToNeonAt)
      .map((s) => s._id);
  },
});

export const markSynced = internalMutation({
  args: { sessionId: v.id("mealSessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      syncedToNeonAt: Date.now(),
    });
  },
});
```

### Cron Schedule

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync-analytics-to-neon",
  { minutes: 15 },
  internal.sync.analyticsSync.syncUnsyncedSessions
);

crons.interval(
  "expire-pending-changes",
  { hours: 1 },
  internal.pendingChanges.expireOldChanges
);

crons.interval(
  "monitor-ingredient-costs",
  { hours: 6 },
  internal.agents.costMonitor.checkPriceChanges
);

crons.interval(
  "demand-forecasting",
  { hours: 12 },
  internal.agents.demandForecaster.generateForecasts
);

export default crons;
```

---

## 6. File Storage

Convex Storage handles all file uploads (food images, recipe videos) without any external storage service. The flow is: client requests an upload URL, uploads directly to Convex Storage, then stores the returned `storageId` in the relevant document.

### Generate Upload URL

```typescript
// convex/storage.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

### Attach Image to Dish

```typescript
// convex/dishes.ts (partial)
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const attachImage = mutation({
  args: {
    dishId: v.id("dishes"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const dish = await ctx.db.get(args.dishId);
    if (!dish) throw new Error("Dish not found");

    if (dish.imageStorageId) {
      await ctx.storage.delete(dish.imageStorageId);
    }

    await ctx.db.patch(args.dishId, {
      imageStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});
```

### Client Upload Component

```typescript
// components/DishImageUpload.tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRef, useState } from "react";

export function DishImageUpload({ dishId }: { dishId: Id<"dishes"> }) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const attachImage = useMutation(api.dishes.attachImage);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const { storageId } = await result.json();
      await attachImage({ dishId, storageId });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload Image"}
      </button>
    </div>
  );
}
```

### Serving Images

```typescript
// components/DishImage.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function DishImage({
  storageId,
  alt,
  className,
}: {
  storageId: Id<"_storage"> | undefined;
  alt: string;
  className?: string;
}) {
  const imageUrl = useQuery(
    api.storage.getFileUrl,
    storageId ? { storageId } : "skip"
  );

  if (!storageId || imageUrl === undefined) {
    return <div className={`bg-muted animate-pulse ${className}`} />;
  }

  if (imageUrl === null) {
    return <div className={`bg-muted flex items-center justify-center ${className}`}>
      <span className="text-muted-foreground text-sm">No image</span>
    </div>;
  }

  return <img src={imageUrl} alt={alt} className={className} />;
}
```

---

## 7. Authentication

Authentication uses Convex Auth, which handles user identity, session tokens, and integration with OAuth providers. Every Convex function can check the user's identity via `ctx.auth.getUserIdentity()`.

### Auth Configuration

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.AUTH_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

### Auth Provider Setup (Client)

```typescript
// app/providers.tsx
"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthProvider, useAuth } from "@/lib/auth";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithAuth>
    </AuthProvider>
  );
}
```

### Auth Check Pattern in Queries

```typescript
// convex/lib/auth.ts
import { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

export async function requireChainAccess(
  ctx: QueryCtx | MutationCtx,
  chainId: string
) {
  const identity = await requireAuth(ctx);

  const chain = await ctx.db
    .query("chains")
    .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
    .first();

  if (!chain || chain._id !== chainId) {
    throw new Error("Not authorized to access this chain");
  }

  return { identity, chain };
}

export async function requireRestaurantAccess(
  ctx: QueryCtx | MutationCtx,
  restaurantId: string
) {
  const identity = await requireAuth(ctx);

  const restaurant = await ctx.db.get(restaurantId as any);
  if (!restaurant) throw new Error("Restaurant not found");

  const chain = await ctx.db.get(restaurant.chainId);
  if (!chain || chain.ownerId !== identity.subject) {
    throw new Error("Not authorized to access this restaurant");
  }

  return { identity, restaurant, chain };
}
```

### Using Auth in Queries and Mutations

```typescript
// convex/restaurants.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireChainAccess } from "./lib/auth";

export const listByChain = query({
  args: { chainId: v.id("chains") },
  returns: v.array(
    v.object({
      _id: v.id("restaurants"),
      name: v.string(),
      city: v.optional(v.string()),
      isActive: v.boolean(),
      sessionCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireChainAccess(ctx, args.chainId);

    const restaurants = await ctx.db
      .query("restaurants")
      .withIndex("by_chain_active", (q) =>
        q.eq("chainId", args.chainId).eq("isActive", true)
      )
      .collect();

    return Promise.all(
      restaurants.map(async (r) => {
        const sessions = await ctx.db
          .query("mealSessions")
          .withIndex("by_restaurant_status", (q) =>
            q.eq("restaurantId", r._id).eq("status", "planning")
          )
          .collect();

        return {
          _id: r._id,
          name: r.name,
          city: r.city,
          isActive: r.isActive,
          sessionCount: sessions.length,
        };
      })
    );
  },
});
```

---

## 8. File Structure

```
convex/
├── _generated/              # Auto-generated by Convex CLI
│   ├── api.d.ts
│   ├── api.js
│   ├── dataModel.d.ts
│   └── server.d.ts
├── schema.ts                # Full schema (Section 2 above)
├── auth.config.ts           # Auth provider configuration
├── convex.config.ts         # Component installation (agents)
├── crons.ts                 # Scheduled functions
│
├── lib/
│   ├── auth.ts              # Auth helpers (requireAuth, requireAccess)
│   └── utils.ts             # Shared utilities
│
├── chains.ts                # Chain CRUD queries/mutations
├── restaurants.ts           # Restaurant CRUD queries/mutations
├── mealSessions.ts          # Session lifecycle queries/mutations
├── sessionMenus.ts          # Menu selection for sessions
├── sessionDishes.ts         # Dish management within sessions
├── sessionFinancials.ts     # Financial calculations
├── menuTemplates.ts         # Menu template CRUD
├── dishes.ts                # Dish catalog CRUD + image attach
├── ingredients.ts           # Ingredient catalog + price tracking
├── recipes.ts               # Recipe CRUD
├── storage.ts               # File upload/download utilities
│
├── aiRules.ts               # Rules CRUD + evaluation
├── pendingChanges.ts        # PendingChange lifecycle
├── proactiveAlerts.ts       # Alert CRUD
├── sessionLocks.ts          # Lock management
│
├── sync/
│   ├── analyticsSync.ts     # "use node" — Neon sync action
│   └── analyticsSyncHelpers.ts  # Internal queries for sync
│
├── agentTools/
│   ├── menuAnalysis.ts      # Agent tools for menu context
│   ├── costAnalysis.ts      # Agent tools for cost queries
│   ├── demandAnalysis.ts    # Agent tools for demand data
│   ├── financialAnalysis.ts # Agent tools for financial queries (Neon)
│   └── recipeAnalysis.ts    # Agent tools for recipe context
│
└── agents/
    ├── orchestrator.ts      # Routes to capability agents
    ├── menuPlanner.ts       # Menu planning agent
    ├── costOptimizer.ts     # Cost optimization agent
    ├── demandForecaster.ts  # Demand forecasting agent
    ├── recipeExpert.ts      # Multimodal recipe agent
    ├── financialAnalyst.ts  # SQL analytics agent
    └── costMonitor.ts       # Background cost monitoring
```

---

*Previous: [05-AGENT-ARCHITECTURE.md](./05-AGENT-ARCHITECTURE.md)*
*Next: [07-PENDING-CHANGES-AND-RULES.md](./07-PENDING-CHANGES-AND-RULES.md)*
