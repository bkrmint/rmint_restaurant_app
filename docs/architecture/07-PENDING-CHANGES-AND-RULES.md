# 07 — Pending Changes, Rules Engine, and Proactive Alerts

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)

---

## Table of Contents

1. [PendingChange System](#1-pendingchange-system)
2. [PendingChange Lifecycle](#2-pendingchange-lifecycle)
3. [Approval Mutation](#3-approval-mutation)
4. [Rules Engine](#4-rules-engine)
5. [Rule Cascading](#5-rule-cascading)
6. [Proactive Alerts](#6-proactive-alerts)
7. [File Structure](#7-file-structure)

---

## 1. PendingChange System

The PendingChange system is the core innovation that makes AI a safe co-worker rather than an autonomous actor. When any AI agent wants to modify workspace data — change a price, swap a menu item, substitute an ingredient — it does **not** write directly to the session data. Instead, it creates a `PendingChange` record that describes the proposed modification, its reasoning, and its projected impact. The user sees this as a card in the AI panel with an "Apply" button and an impact badge.

This pattern solves the trust problem: restaurant operators manage real budgets and real menus. Prices that change without approval could cost real money. The PendingChange system ensures every AI modification is reviewed, understood, and explicitly approved before it touches live data.

### Change Types

```typescript
// convex/lib/types.ts

type ChangeType =
  | "price_change"       // AI suggests a new price for a dish
  | "menu_swap"          // AI suggests replacing one menu template with another
  | "ingredient_sub"     // AI suggests substituting an ingredient (cost or availability)
  | "rule_add"           // AI suggests adding a new rule based on observed patterns
  | "quantity_adjust"    // AI suggests adjusting serving quantities
  | "cost_alert";        // AI flags a cost issue that needs human decision
```

### PendingChange Schema (reference from 06-DATA-LAYER)

```typescript
// From convex/schema.ts — the pendingChanges table
pendingChanges: defineTable({
  sessionId: v.id("mealSessions"),
  agentName: v.string(),              // Which capability agent created this
  threadId: v.optional(v.string()),    // Link to conversation thread if any
  changeType: v.union(
    v.literal("price_change"),
    v.literal("menu_swap"),
    v.literal("ingredient_sub"),
    v.literal("rule_add"),
    v.literal("quantity_adjust"),
    v.literal("cost_alert")
  ),
  targetTable: v.string(),             // e.g., "sessionDishes", "sessionMenus"
  targetId: v.optional(v.string()),    // _id of the document to modify
  description: v.string(),             // Human-readable summary
  reasoning: v.string(),               // Why the agent suggests this
  beforeState: v.optional(v.any()),    // Snapshot of current values
  afterState: v.any(),                 // Proposed new values
  impact: v.optional(v.object({
    revenueChange: v.optional(v.number()),   // e.g., +450
    profitChange: v.optional(v.number()),    // e.g., +190
    costChange: v.optional(v.number()),      // e.g., -30
    marginChange: v.optional(v.number()),    // e.g., +2.5 (percentage points)
  })),
  confidence: v.number(),              // 0.0 – 1.0
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("expired")
  ),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  expiresAt: v.number(),              // Auto-expire timestamp
  createdAt: v.number(),
})
  .index("by_session", ["sessionId"])
  .index("by_session_status", ["sessionId", "status"])
  .index("by_status", ["status"])
  .index("by_expires", ["expiresAt"]),
```

### How Agents Create PendingChanges

Agents create pending changes through a Convex internal mutation. The agent tool gathers the current state, computes the proposed change, runs it through the Rules Engine, and if it passes, writes the PendingChange.

```typescript
// convex/agentTools/createSuggestion.ts
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const createPriceChangeSuggestion = internalMutation({
  args: {
    sessionId: v.id("mealSessions"),
    sessionDishId: v.id("sessionDishes"),
    suggestedPrice: v.number(),
    reasoning: v.string(),
    agentName: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionDish = await ctx.db.get(args.sessionDishId);
    if (!sessionDish) throw new Error("Session dish not found");

    const dish = await ctx.db.get(sessionDish.dishId);
    if (!dish) throw new Error("Dish not found");

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const currentPrice = sessionDish.overridePrice ?? dish.basePrice;
    const priceDiff = args.suggestedPrice - currentPrice;
    const revenueChange = priceDiff * sessionDish.quantity;
    const profitChange = revenueChange;
    const newMargin =
      args.suggestedPrice > 0
        ? ((args.suggestedPrice - dish.costPerServing) / args.suggestedPrice) * 100
        : 0;
    const oldMargin =
      currentPrice > 0
        ? ((currentPrice - dish.costPerServing) / currentPrice) * 100
        : 0;

    const change = {
      sessionId: args.sessionId,
      agentName: args.agentName,
      threadId: args.threadId,
      changeType: "price_change" as const,
      targetTable: "sessionDishes",
      targetId: args.sessionDishId,
      description: `Change ${dish.name} price from $${currentPrice.toFixed(2)} to $${args.suggestedPrice.toFixed(2)}`,
      reasoning: args.reasoning,
      beforeState: {
        overridePrice: sessionDish.overridePrice,
        effectivePrice: currentPrice,
        margin: Math.round(oldMargin * 100) / 100,
      },
      afterState: {
        overridePrice: args.suggestedPrice,
        effectivePrice: args.suggestedPrice,
        margin: Math.round(newMargin * 100) / 100,
      },
      impact: {
        revenueChange: Math.round(revenueChange * 100) / 100,
        profitChange: Math.round(profitChange * 100) / 100,
        costChange: 0,
        marginChange: Math.round((newMargin - oldMargin) * 100) / 100,
      },
      confidence: 0.85,
      status: "pending" as const,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      createdAt: Date.now(),
    };

    return await ctx.db.insert("pendingChanges", change);
  },
});
```

---

## 2. PendingChange Lifecycle

Every PendingChange follows a strict state machine with four terminal states.

### State Machine

```
                ┌─────────────┐
                │   created   │   Agent writes PendingChange
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
           ┌────│   pending   │────┐
           │    └──────┬──────┘    │
           │           │           │
     User clicks   User clicks   24h timer
      "Apply"      "Dismiss"     fires
           │           │           │
           ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ approved │ │ rejected │ │ expired  │
     └──────────┘ └──────────┘ └──────────┘
           │
           │  Mutation applies afterState
           │  to targetTable.targetId
           ▼
     ┌──────────────────┐
     │ Session data      │
     │ updated           │
     │ (reactive → UI    │
     │  auto-refreshes)  │
     └──────────────────┘
```

### State Transitions

| From | To | Trigger | Side Effects |
|------|----|---------|-------------|
| created | pending | Immediate on insert | Appears in AI panel as suggestion card |
| pending | approved | User clicks Apply | `afterState` applied to target, financials recalculated |
| pending | rejected | User clicks Dismiss | Marked rejected, card fades from AI panel |
| pending | expired | Cron job checks `expiresAt` | Marked expired, removed from active view |

### Queries for PendingChange Display

```typescript
// convex/pendingChanges.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const listPending = query({
  args: { sessionId: v.id("mealSessions") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    return await ctx.db
      .query("pendingChanges")
      .withIndex("by_session_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .order("desc")
      .collect();
  },
});

export const listAll = query({
  args: {
    sessionId: v.id("mealSessions"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const q = ctx.db
      .query("pendingChanges")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc");

    return args.limit ? await q.take(args.limit) : await q.collect();
  },
});

export const countPending = query({
  args: { sessionId: v.id("mealSessions") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingChanges")
      .withIndex("by_session_status", (q) =>
        q.eq("sessionId", args.sessionId).eq("status", "pending")
      )
      .collect();

    return pending.length;
  },
});
```

### Expiration Cron

```typescript
// convex/pendingChanges.ts (continued)

export const expireOldChanges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("pendingChanges")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    let expiredCount = 0;
    for (const change of expired) {
      if (change.expiresAt <= now) {
        await ctx.db.patch(change._id, {
          status: "expired",
          reviewedAt: now,
        });
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`Expired ${expiredCount} pending changes`);
    }
  },
});
```

---

## 3. Approval Mutation

The approval mutation is the critical path — it reads the PendingChange, applies the `afterState` to the target document, marks the change as approved, and triggers a financial recalculation. Because Convex mutations are transactional, either all writes succeed or none do.

```typescript
// convex/pendingChanges.ts (continued)

export const approve = mutation({
  args: { changeId: v.id("pendingChanges") },
  returns: v.object({
    success: v.boolean(),
    description: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const change = await ctx.db.get(args.changeId);
    if (!change) throw new Error("Pending change not found");
    if (change.status !== "pending") {
      throw new Error(`Change is already ${change.status}`);
    }

    const session = await ctx.db.get(change.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "published") {
      throw new Error("Cannot modify a published session");
    }

    switch (change.changeType) {
      case "price_change":
        await applyPriceChange(ctx, change);
        break;
      case "menu_swap":
        await applyMenuSwap(ctx, change);
        break;
      case "ingredient_sub":
        await applyIngredientSub(ctx, change);
        break;
      case "quantity_adjust":
        await applyQuantityAdjust(ctx, change);
        break;
      case "rule_add":
        await applyRuleAdd(ctx, change);
        break;
      case "cost_alert":
        break;
      default: {
        const _exhaustive: never = change.changeType;
        throw new Error(`Unknown change type: ${change.changeType}`);
      }
    }

    await ctx.db.patch(args.changeId, {
      status: "approved",
      reviewedBy: identity.subject,
      reviewedAt: Date.now(),
    });

    return {
      success: true,
      description: change.description,
    };
  },
});

export const reject = mutation({
  args: {
    changeId: v.id("pendingChanges"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const change = await ctx.db.get(args.changeId);
    if (!change) throw new Error("Pending change not found");
    if (change.status !== "pending") {
      throw new Error(`Change is already ${change.status}`);
    }

    await ctx.db.patch(args.changeId, {
      status: "rejected",
      reviewedBy: identity.subject,
      reviewedAt: Date.now(),
    });
  },
});
```

### Apply Functions by Change Type

```typescript
// convex/pendingChanges.ts (continued)

import { Id } from "./_generated/dataModel";

type MutationCtx = {
  db: any;
};

async function applyPriceChange(ctx: MutationCtx, change: any) {
  const targetId = change.targetId as Id<"sessionDishes">;
  const sessionDish = await ctx.db.get(targetId);
  if (!sessionDish) throw new Error("Target session dish not found");

  await ctx.db.patch(targetId, {
    overridePrice: change.afterState.overridePrice,
    updatedAt: Date.now(),
  });

  await recalculateFinancials(ctx, change.sessionId);
}

async function applyMenuSwap(ctx: MutationCtx, change: any) {
  const targetId = change.targetId as Id<"sessionMenus">;
  const sessionMenu = await ctx.db.get(targetId);
  if (!sessionMenu) throw new Error("Target session menu not found");

  await ctx.db.patch(targetId, {
    isSelected: false,
  });

  const newMenuTemplateId = change.afterState.menuTemplateId;
  await ctx.db.insert("sessionMenus", {
    sessionId: change.sessionId,
    menuTemplateId: newMenuTemplateId,
    position: sessionMenu.position,
    isSelected: true,
    createdAt: Date.now(),
  });

  await recalculateFinancials(ctx, change.sessionId);
}

async function applyIngredientSub(ctx: MutationCtx, change: any) {
  const targetId = change.targetId as Id<"dishIngredients">;
  const dishIngredient = await ctx.db.get(targetId);
  if (!dishIngredient) throw new Error("Target dish ingredient not found");

  await ctx.db.patch(targetId, {
    ingredientId: change.afterState.ingredientId,
    quantityPerServing: change.afterState.quantityPerServing ?? dishIngredient.quantityPerServing,
  });

  const dish = await ctx.db.get(dishIngredient.dishId);
  if (dish) {
    const allIngredients = await ctx.db
      .query("dishIngredients")
      .withIndex("by_dish", (q: any) => q.eq("dishId", dish._id))
      .collect();

    let newCost = 0;
    for (const di of allIngredients) {
      const ingredient = await ctx.db.get(di.ingredientId);
      if (ingredient) {
        newCost += ingredient.currentPricePerUnit * di.quantityPerServing;
      }
    }

    await ctx.db.patch(dish._id, {
      costPerServing: Math.round(newCost * 100) / 100,
      updatedAt: Date.now(),
    });
  }

  await recalculateFinancials(ctx, change.sessionId);
}

async function applyQuantityAdjust(ctx: MutationCtx, change: any) {
  const targetId = change.targetId as Id<"sessionDishes">;
  await ctx.db.patch(targetId, {
    quantity: change.afterState.quantity,
    updatedAt: Date.now(),
  });

  await recalculateFinancials(ctx, change.sessionId);
}

async function applyRuleAdd(ctx: MutationCtx, change: any) {
  await ctx.db.insert("aiRules", {
    scope: change.afterState.scope,
    scopeId: change.afterState.scopeId,
    ruleType: change.afterState.ruleType,
    label: change.afterState.label,
    description: change.afterState.description,
    config: change.afterState.config,
    priority: change.afterState.priority ?? 50,
    isActive: true,
    createdBy: "ai-agent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function recalculateFinancials(ctx: MutationCtx, sessionId: Id<"mealSessions">) {
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
    const totalCost = totalIngredientCost + financials.laborCostTotal + financials.overheadCostTotal;
    const profit = totalRevenue - totalCost;

    await ctx.db.patch(financials._id, {
      ingredientCostTotal: totalIngredientCost,
      projectedRevenue: totalRevenue,
      projectedProfit: profit,
      primeCostPercentage: totalRevenue > 0
        ? Math.round(((totalIngredientCost + financials.laborCostTotal) / totalRevenue) * 10000) / 100
        : 0,
      foodCostPercentage: totalRevenue > 0
        ? Math.round((totalIngredientCost / totalRevenue) * 10000) / 100
        : 0,
      avgRevenuePerCover: session.expectedHeadcount > 0
        ? Math.round((totalRevenue / session.expectedHeadcount) * 100) / 100
        : 0,
      breakEvenCovers: profit > 0 && totalRevenue > 0
        ? Math.ceil(totalCost / (totalRevenue / session.expectedHeadcount))
        : session.expectedHeadcount,
      updatedAt: Date.now(),
    });
  }
}
```

### Client: Suggestion Card Component

```typescript
// components/ai-panel/SuggestionCard.tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";

interface PendingChange {
  _id: Id<"pendingChanges">;
  changeType: string;
  description: string;
  reasoning: string;
  impact?: {
    revenueChange?: number;
    profitChange?: number;
    costChange?: number;
    marginChange?: number;
  };
  confidence: number;
  agentName: string;
  createdAt: number;
}

export function SuggestionCard({ change }: { change: PendingChange }) {
  const approve = useMutation(api.pendingChanges.approve);
  const reject = useMutation(api.pendingChanges.reject);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await approve({ changeId: change._id });
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    await reject({ changeId: change._id });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase">
          {change.agentName}
        </span>
        <ConfidenceBadge value={change.confidence} />
      </div>

      <p className="text-sm font-medium">{change.description}</p>
      <p className="text-xs text-muted-foreground">{change.reasoning}</p>

      {change.impact && (
        <div className="flex gap-2 flex-wrap">
          {change.impact.revenueChange !== undefined && (
            <ImpactBadge
              label="Revenue"
              value={change.impact.revenueChange}
              prefix="$"
            />
          )}
          {change.impact.profitChange !== undefined && (
            <ImpactBadge
              label="Profit"
              value={change.impact.profitChange}
              prefix="$"
            />
          )}
          {change.impact.marginChange !== undefined && (
            <ImpactBadge
              label="Margin"
              value={change.impact.marginChange}
              suffix="pp"
            />
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm
                     rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Applying..." : "Apply"}
        </button>
        <button
          onClick={handleReject}
          className="px-3 py-1.5 text-sm text-muted-foreground
                     hover:text-foreground rounded-md hover:bg-muted"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ImpactBadge({
  label,
  value,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const isPositive = value > 0;
  const formatted = `${isPositive ? "+" : ""}${prefix}${Math.abs(value).toLocaleString()}${suffix}`;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isPositive
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {label}: {formatted}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="text-xs text-muted-foreground">
      {pct}% confidence
    </span>
  );
}
```

---

## 4. Rules Engine

The Rules Engine is a **deterministic filter** that runs before any AI suggestion reaches the user. When an agent generates a candidate suggestion, the Rules Engine evaluates it against all active rules for the current scope (chain, restaurant, session). If a suggestion violates any rule, it is either blocked entirely or flagged with a warning.

Rules are user-defined and directly editable in the AI Rules step of the workspace. The system gives users explicit control over what the AI can and cannot suggest.

### Rule Types

| Rule Type | Description | Config Example |
|-----------|-------------|----------------|
| `cuisine_filter` | Only allow suggestions for specific cuisines | `{ operator: "in", field: "cuisineType", value: ["Indian", "Thai"] }` |
| `margin_threshold` | Reject suggestions below minimum margin | `{ operator: "gte", field: "margin", value: 30 }` |
| `prep_time_limit` | Reject dishes exceeding max prep time | `{ operator: "lte", field: "prepTimeMinutes", value: 45 }` |
| `headcount_min` | Only suggest if expected headcount meets minimum | `{ operator: "gte", field: "expectedHeadcount", value: 50 }` |
| `seasonal_preference` | Prefer seasonal items | `{ operator: "eq", field: "isSeasonalItem", value: true }` |
| `dietary_restriction` | Exclude allergens or require dietary tags | `{ operator: "not_in", field: "allergens", value: ["peanuts", "shellfish"] }` |
| `custom` | Free-form expression evaluated at runtime | `{ operator: "custom_eval", customExpression: "price < costPerServing * 3" }` |

### Rule CRUD

```typescript
// convex/aiRules.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const listByScope = query({
  args: {
    scope: v.union(v.literal("chain"), v.literal("restaurant"), v.literal("session")),
    scopeId: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    return await ctx.db
      .query("aiRules")
      .withIndex("by_scope_active", (q) =>
        q.eq("scope", args.scope).eq("scopeId", args.scopeId).eq("isActive", true)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    scope: v.union(v.literal("chain"), v.literal("restaurant"), v.literal("session")),
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
      operator: v.optional(v.string()),
      field: v.optional(v.string()),
      value: v.optional(v.any()),
      customExpression: v.optional(v.string()),
    }),
    priority: v.optional(v.number()),
  },
  returns: v.id("aiRules"),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    return await ctx.db.insert("aiRules", {
      ...args,
      config: {
        operator: args.config.operator as any,
        field: args.config.field,
        value: args.config.value,
        customExpression: args.config.customExpression,
      },
      priority: args.priority ?? 50,
      isActive: true,
      createdBy: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const toggleActive = mutation({
  args: {
    ruleId: v.id("aiRules"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    await ctx.db.patch(args.ruleId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { ruleId: v.id("aiRules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.ruleId);
  },
});
```

### Rule Evaluation Engine

The evaluation engine checks a candidate suggestion against all active rules. It is called by agents before they create a PendingChange. Suggestions that fail mandatory rules are blocked; those that fail advisory rules are flagged but still created.

```typescript
// convex/lib/rulesEngine.ts
import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

interface RuleConfig {
  operator?: string;
  field?: string;
  value?: any;
  customExpression?: string;
}

interface Rule {
  _id: Id<"aiRules">;
  scope: "chain" | "restaurant" | "session";
  scopeId: string;
  ruleType: string;
  label: string;
  config: RuleConfig;
  priority: number;
  isActive: boolean;
}

interface SuggestionContext {
  dish?: {
    cuisineType: string;
    prepTimeMinutes: number;
    isSeasonalItem: boolean;
    allergens: string[];
    dietaryTags: string[];
    basePrice: number;
    costPerServing: number;
  };
  suggestedPrice?: number;
  margin?: number;
  session?: {
    expectedHeadcount: number;
    mealType: string;
  };
}

interface EvaluationResult {
  passed: boolean;
  violations: Array<{
    rule: Rule;
    message: string;
  }>;
  warnings: Array<{
    rule: Rule;
    message: string;
  }>;
}

export async function evaluateSuggestion(
  ctx: QueryCtx,
  chainId: string,
  restaurantId: string,
  sessionId: string,
  suggestion: SuggestionContext
): Promise<EvaluationResult> {
  const chainRules = await ctx.db
    .query("aiRules")
    .withIndex("by_scope_active", (q) =>
      q.eq("scope", "chain").eq("scopeId", chainId).eq("isActive", true)
    )
    .collect();

  const restaurantRules = await ctx.db
    .query("aiRules")
    .withIndex("by_scope_active", (q) =>
      q.eq("scope", "restaurant").eq("scopeId", restaurantId).eq("isActive", true)
    )
    .collect();

  const sessionRules = await ctx.db
    .query("aiRules")
    .withIndex("by_scope_active", (q) =>
      q.eq("scope", "session").eq("scopeId", sessionId).eq("isActive", true)
    )
    .collect();

  const mergedRules = mergeRuleCascade(chainRules, restaurantRules, sessionRules);

  const violations: EvaluationResult["violations"] = [];
  const warnings: EvaluationResult["warnings"] = [];

  for (const rule of mergedRules) {
    const result = evaluateRule(rule, suggestion);
    if (!result.passed) {
      if (rule.priority >= 70) {
        violations.push({ rule, message: result.message });
      } else {
        warnings.push({ rule, message: result.message });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
  };
}

function evaluateRule(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  switch (rule.ruleType) {
    case "cuisine_filter":
      return evaluateCuisineFilter(rule, ctx);
    case "margin_threshold":
      return evaluateMarginThreshold(rule, ctx);
    case "prep_time_limit":
      return evaluatePrepTimeLimit(rule, ctx);
    case "headcount_min":
      return evaluateHeadcountMin(rule, ctx);
    case "seasonal_preference":
      return evaluateSeasonalPreference(rule, ctx);
    case "dietary_restriction":
      return evaluateDietaryRestriction(rule, ctx);
    case "custom":
      return evaluateCustomRule(rule, ctx);
    default:
      return { passed: true, message: "" };
  }
}

function evaluateCuisineFilter(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!ctx.dish) return { passed: true, message: "" };
  const allowed = rule.config.value as string[];
  const cuisine = ctx.dish.cuisineType;

  if (rule.config.operator === "in") {
    const passed = allowed.includes(cuisine);
    return {
      passed,
      message: passed ? "" : `${cuisine} cuisine not in allowed list: ${allowed.join(", ")}`,
    };
  }
  if (rule.config.operator === "not_in") {
    const passed = !allowed.includes(cuisine);
    return {
      passed,
      message: passed ? "" : `${cuisine} cuisine is in excluded list`,
    };
  }
  return { passed: true, message: "" };
}

function evaluateMarginThreshold(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  const margin = ctx.margin;
  if (margin === undefined) return { passed: true, message: "" };
  const threshold = rule.config.value as number;

  const passed = compareValues(margin, rule.config.operator!, threshold);
  return {
    passed,
    message: passed
      ? ""
      : `Margin ${margin.toFixed(1)}% does not meet threshold ${rule.config.operator} ${threshold}%`,
  };
}

function evaluatePrepTimeLimit(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!ctx.dish) return { passed: true, message: "" };
  const limit = rule.config.value as number;
  const passed = ctx.dish.prepTimeMinutes <= limit;
  return {
    passed,
    message: passed
      ? ""
      : `Prep time ${ctx.dish.prepTimeMinutes}min exceeds limit of ${limit}min`,
  };
}

function evaluateHeadcountMin(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!ctx.session) return { passed: true, message: "" };
  const min = rule.config.value as number;
  const passed = ctx.session.expectedHeadcount >= min;
  return {
    passed,
    message: passed
      ? ""
      : `Expected headcount ${ctx.session.expectedHeadcount} below minimum ${min}`,
  };
}

function evaluateSeasonalPreference(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!ctx.dish) return { passed: true, message: "" };
  const preferSeasonal = rule.config.value as boolean;
  if (preferSeasonal && !ctx.dish.isSeasonalItem) {
    return {
      passed: false,
      message: "Non-seasonal item; seasonal items preferred",
    };
  }
  return { passed: true, message: "" };
}

function evaluateDietaryRestriction(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!ctx.dish) return { passed: true, message: "" };
  const excluded = rule.config.value as string[];

  if (rule.config.operator === "not_in" && rule.config.field === "allergens") {
    const found = ctx.dish.allergens.filter((a) => excluded.includes(a));
    if (found.length > 0) {
      return {
        passed: false,
        message: `Contains excluded allergens: ${found.join(", ")}`,
      };
    }
  }

  if (rule.config.operator === "contains" && rule.config.field === "dietaryTags") {
    const required = rule.config.value as string[];
    const missing = required.filter((t) => !ctx.dish!.dietaryTags.includes(t));
    if (missing.length > 0) {
      return {
        passed: false,
        message: `Missing required dietary tags: ${missing.join(", ")}`,
      };
    }
  }

  return { passed: true, message: "" };
}

function evaluateCustomRule(
  rule: Rule,
  ctx: SuggestionContext
): { passed: boolean; message: string } {
  if (!rule.config.customExpression) return { passed: true, message: "" };

  try {
    const evalContext: Record<string, any> = {
      ...(ctx.dish ?? {}),
      suggestedPrice: ctx.suggestedPrice,
      margin: ctx.margin,
      expectedHeadcount: ctx.session?.expectedHeadcount,
      mealType: ctx.session?.mealType,
    };

    const expr = rule.config.customExpression;
    const fn = new Function(
      ...Object.keys(evalContext),
      `return (${expr});`
    );
    const passed = fn(...Object.values(evalContext));

    return {
      passed: Boolean(passed),
      message: passed ? "" : `Custom rule failed: ${rule.label}`,
    };
  } catch {
    return { passed: true, message: "" };
  }
}

function compareValues(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    default: return true;
  }
}

function mergeRuleCascade(
  chainRules: Rule[],
  restaurantRules: Rule[],
  sessionRules: Rule[]
): Rule[] {
  const ruleMap = new Map<string, Rule>();

  for (const rule of chainRules) {
    ruleMap.set(`${rule.ruleType}:${rule.config.field ?? "default"}`, rule);
  }
  for (const rule of restaurantRules) {
    ruleMap.set(`${rule.ruleType}:${rule.config.field ?? "default"}`, rule);
  }
  for (const rule of sessionRules) {
    ruleMap.set(`${rule.ruleType}:${rule.config.field ?? "default"}`, rule);
  }

  return Array.from(ruleMap.values()).sort((a, b) => b.priority - a.priority);
}
```

---

## 5. Rule Cascading

Rules exist at three scope levels. More specific scopes override more general ones for the same rule type and field combination.

### Cascade Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    CHAIN RULES                               │
│                    (most general)                             │
│                                                              │
│  Example: "All restaurants: only Indian and Thai cuisines"   │
│  Example: "All restaurants: minimum 25% margin"              │
│                                                              │
│  Applied to: Every restaurant in the chain                   │
│  Scope: chain, ScopeId: chainId                              │
├─────────────────────────────────────────────────────────────┤
│                    RESTAURANT RULES                          │
│                    (override chain)                           │
│                                                              │
│  Example: "This restaurant: also allow Italian cuisine"      │
│  Example: "This restaurant: minimum 30% margin (stricter)"   │
│                                                              │
│  Override: Same ruleType+field replaces the chain rule       │
│  Scope: restaurant, ScopeId: restaurantId                    │
├─────────────────────────────────────────────────────────────┤
│                    SESSION RULES                             │
│                    (most specific, override all)              │
│                                                              │
│  Example: "This dinner: allow up to 60min prep (special)"    │
│  Example: "This lunch: headcount minimum 100 (event)"        │
│                                                              │
│  Override: Same ruleType+field replaces restaurant rule      │
│  Scope: session, ScopeId: sessionId                          │
└─────────────────────────────────────────────────────────────┘
```

### Merge Algorithm

The `mergeRuleCascade` function (shown above in the Rules Engine) uses a **last-write-wins** strategy keyed by `ruleType:field`:

1. Insert all chain rules into the map
2. Insert all restaurant rules — same key overwrites chain rule
3. Insert all session rules — same key overwrites restaurant rule
4. The remaining map values are the effective rules

**Example cascade:**

```
Chain rule:       cuisine_filter:cuisineType → { operator: "in", value: ["Indian", "Thai"] }
Restaurant rule:  cuisine_filter:cuisineType → { operator: "in", value: ["Indian", "Thai", "Italian"] }
Session rule:     (none for cuisine)

Effective:        cuisine_filter:cuisineType → ["Indian", "Thai", "Italian"]  (restaurant override wins)

Chain rule:       margin_threshold:margin → { operator: "gte", value: 25 }
Restaurant rule:  (none)
Session rule:     margin_threshold:margin → { operator: "gte", value: 20 }

Effective:        margin_threshold:margin → gte 20  (session override wins, looser for special event)
```

### Client: Rules Step Display

```typescript
// components/workspace/steps/AiRulesStep.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function AiRulesStep({
  sessionId,
  restaurantId,
  chainId,
}: {
  sessionId: Id<"mealSessions">;
  restaurantId: Id<"restaurants">;
  chainId: Id<"chains">;
}) {
  const chainRules = useQuery(api.aiRules.listByScope, {
    scope: "chain",
    scopeId: chainId,
  });
  const restaurantRules = useQuery(api.aiRules.listByScope, {
    scope: "restaurant",
    scopeId: restaurantId,
  });
  const sessionRules = useQuery(api.aiRules.listByScope, {
    scope: "session",
    scopeId: sessionId,
  });

  const createRule = useMutation(api.aiRules.create);
  const toggleRule = useMutation(api.aiRules.toggleActive);
  const removeRule = useMutation(api.aiRules.remove);

  if (chainRules === undefined || restaurantRules === undefined || sessionRules === undefined) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <RuleSection
        title="Chain Rules"
        subtitle="Apply to all restaurants"
        rules={chainRules}
        scope="chain"
        scopeId={chainId}
        onToggle={(id, active) => toggleRule({ ruleId: id, isActive: active })}
        onRemove={(id) => removeRule({ ruleId: id })}
        onAdd={(rule) => createRule({ ...rule, scope: "chain", scopeId: chainId })}
      />

      <RuleSection
        title="Restaurant Rules"
        subtitle="Override chain rules for this restaurant"
        rules={restaurantRules}
        scope="restaurant"
        scopeId={restaurantId}
        onToggle={(id, active) => toggleRule({ ruleId: id, isActive: active })}
        onRemove={(id) => removeRule({ ruleId: id })}
        onAdd={(rule) => createRule({ ...rule, scope: "restaurant", scopeId: restaurantId })}
      />

      <RuleSection
        title="Session Rules"
        subtitle="Override all for this specific meal session"
        rules={sessionRules}
        scope="session"
        scopeId={sessionId}
        onToggle={(id, active) => toggleRule({ ruleId: id, isActive: active })}
        onRemove={(id) => removeRule({ ruleId: id })}
        onAdd={(rule) => createRule({ ...rule, scope: "session", scopeId: sessionId })}
      />
    </div>
  );
}
```

---

## 6. Proactive Alerts

Proactive alerts are created by background agents running as Convex scheduled functions. Unlike PendingChanges (which propose modifications), alerts are informational — they notify the user about cost changes, optimization opportunities, demand shifts, or menu suggestions.

Alerts appear in the AI Co-Worker panel as dismissible cards. They are scoped to a restaurant (general) or a specific session (contextual).

### Alert Types

| Type | Source Agent | Example |
|------|-------------|---------|
| `cost_alert` | Cost Monitor (cron) | "Potato prices up 15% this week — 3 dishes affected" |
| `optimization` | Cost Optimizer | "Switching to local supplier for chicken saves $120/week" |
| `demand_update` | Demand Forecaster | "Friday dinner bookings 40% above average — consider adding capacity" |
| `menu_suggestion` | Menu Planner | "Seasonal ingredient in stock: consider adding butternut squash soup" |

### Alert Queries and Mutations

```typescript
// convex/proactiveAlerts.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const listActive = query({
  args: {
    restaurantId: v.id("restaurants"),
    sessionId: v.optional(v.id("mealSessions")),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let alerts;
    if (args.sessionId) {
      alerts = await ctx.db
        .query("proactiveAlerts")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .collect();
    } else {
      alerts = await ctx.db
        .query("proactiveAlerts")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
        .order("desc")
        .collect();
    }

    const active = alerts.filter((a) => !a.isDismissed);
    return args.limit ? active.slice(0, args.limit) : active;
  },
});

export const countUnread = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const unread = await ctx.db
      .query("proactiveAlerts")
      .withIndex("by_restaurant_unread", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("isRead", false)
      )
      .collect();

    return unread.filter((a) => !a.isDismissed).length;
  },
});

export const markRead = mutation({
  args: { alertId: v.id("proactiveAlerts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.patch(args.alertId, { isRead: true });
  },
});

export const dismiss = mutation({
  args: { alertId: v.id("proactiveAlerts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.patch(args.alertId, { isDismissed: true, isRead: true });
  },
});

export const markAllRead = mutation({
  args: { restaurantId: v.id("restaurants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const unread = await ctx.db
      .query("proactiveAlerts")
      .withIndex("by_restaurant_unread", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("isRead", false)
      )
      .collect();

    for (const alert of unread) {
      await ctx.db.patch(alert._id, { isRead: true });
    }
  },
});

export const create = internalMutation({
  args: {
    restaurantId: v.id("restaurants"),
    sessionId: v.optional(v.id("mealSessions")),
    agentName: v.string(),
    alertType: v.union(
      v.literal("cost_alert"),
      v.literal("optimization"),
      v.literal("demand_update"),
      v.literal("menu_suggestion")
    ),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("proactiveAlerts", {
      ...args,
      isRead: false,
      isDismissed: false,
      createdAt: Date.now(),
    });
  },
});
```

### Background Agent: Cost Monitor

```typescript
// convex/agents/costMonitor.ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const checkPriceChanges = internalAction({
  args: {},
  handler: async (ctx) => {
    const changes = await ctx.runQuery(
      internal.ingredients.getRecentPriceChanges
    );

    for (const change of changes) {
      if (Math.abs(change.percentChange) >= 10) {
        const severity = Math.abs(change.percentChange) >= 20 ? "critical" : "warning";
        const direction = change.percentChange > 0 ? "up" : "down";

        await ctx.runMutation(internal.proactiveAlerts.create, {
          restaurantId: change.restaurantId,
          agentName: "Cost Monitor",
          alertType: "cost_alert",
          severity,
          title: `${change.ingredientName} price ${direction} ${Math.abs(change.percentChange).toFixed(0)}%`,
          message: `${change.ingredientName} changed from $${change.previousPrice.toFixed(2)} to $${change.currentPrice.toFixed(2)} per ${change.unit}. ${change.affectedDishCount} dish(es) affected.`,
          data: {
            ingredientId: change.ingredientId,
            previousPrice: change.previousPrice,
            currentPrice: change.currentPrice,
            percentChange: change.percentChange,
            affectedDishes: change.affectedDishes,
          },
        });
      }
    }
  },
});
```

### Client: Alert Card Component

```typescript
// components/ai-panel/AlertCard.tsx
"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const severityStyles = {
  info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
  critical: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
};

const alertTypeIcons = {
  cost_alert: "TrendingUp",
  optimization: "Lightbulb",
  demand_update: "BarChart",
  menu_suggestion: "UtensilsCrossed",
};

interface Alert {
  _id: Id<"proactiveAlerts">;
  alertType: keyof typeof alertTypeIcons;
  severity: keyof typeof severityStyles;
  title: string;
  message: string;
  agentName: string;
  isRead: boolean;
  createdAt: number;
}

export function AlertCard({ alert }: { alert: Alert }) {
  const markRead = useMutation(api.proactiveAlerts.markRead);
  const dismiss = useMutation(api.proactiveAlerts.dismiss);

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${severityStyles[alert.severity]} ${
        !alert.isRead ? "ring-1 ring-primary/20" : ""
      }`}
      onMouseEnter={() => {
        if (!alert.isRead) markRead({ alertId: alert._id });
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {alert.agentName}
        </span>
        <button
          onClick={() => dismiss({ alertId: alert._id })}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Dismiss
        </button>
      </div>
      <p className="text-sm font-medium">{alert.title}</p>
      <p className="text-xs text-muted-foreground">{alert.message}</p>
    </div>
  );
}
```

---

## 7. File Structure

```
convex/
├── aiRules.ts                    # Rule CRUD mutations/queries
├── pendingChanges.ts             # PendingChange lifecycle (create, approve, reject, expire)
├── proactiveAlerts.ts            # Alert CRUD + background create
│
├── lib/
│   ├── rulesEngine.ts            # Evaluation engine + rule cascade merge
│   └── types.ts                  # Shared TypeScript types (ChangeType, AlertType, etc.)
│
├── agentTools/
│   └── createSuggestion.ts       # Internal mutations for agents to create suggestions
│
└── agents/
    └── costMonitor.ts            # Background agent: checks ingredient price changes

app/
├── components/
│   ├── ai-panel/
│   │   ├── SuggestionCard.tsx    # PendingChange card with Apply/Dismiss
│   │   ├── AlertCard.tsx         # Proactive alert card
│   │   ├── SuggestionList.tsx    # List of pending suggestions for session
│   │   └── AlertList.tsx         # List of active alerts
│   │
│   └── workspace/
│       └── steps/
│           └── AiRulesStep.tsx   # Rules display + add/remove per scope
```

---

*Previous: [06-DATA-LAYER.md](./06-DATA-LAYER.md)*
*Next: [08-IMPLEMENTATION-PHASES.md](./08-IMPLEMENTATION-PHASES.md)*
