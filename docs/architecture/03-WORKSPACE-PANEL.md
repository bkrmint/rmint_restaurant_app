# 03 — Workspace Panel: Structured Data Entry

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)
**Depends On:** [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md), [02-CALENDAR-SIDEBAR.md](./02-CALENDAR-SIDEBAR.md)

---

## Table of Contents

1. [What is the Workspace Panel](#1-what-is-the-workspace-panel)
2. [Step Router](#2-step-router)
3. [Step 1: AI Rules](#3-step-1-ai-rules)
4. [Step 2: Packaging](#4-step-2-packaging)
5. [Step 3: Implementation](#5-step-3-implementation)
6. [Step 4: Finances](#6-step-4-finances)
7. [Step 5: Menu (Publish)](#7-step-5-menu-publish)
8. [PendingChange Overlay](#8-pendingchange-overlay)
9. [File Structure](#9-file-structure)

---

## 1. What is the Workspace Panel

The Workspace Panel is the **center panel** of the three-panel layout. It renders **deterministic React components** per workflow step — forms, tables, carousels — in predictable positions. Operators build muscle memory around these layouts. AI suggestions appear as **PendingChange overlays** on cells or fields; the underlying data is never modified until the user explicitly approves.

### Data Flow

All workspace data is loaded via **Convex `useQuery`** — reactive, auto-updating. There is **no React Query**. When the AI panel's Apply button triggers a mutation, the workspace's subscribed queries re-fire automatically and the UI updates in place.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WORKSPACE PANEL DATA FLOW                            │
│                                                                         │
│  URL: /[restaurantId]/plan/[date]/[meal]/[step]                        │
│         │                                                               │
│         ▼                                                               │
│  WorkspacePanel reads params → useQuery(api.mealSessions.getByDateAndMeal)│
│         │                                                               │
│         ▼                                                               │
│  Step component receives sessionId → useQuery(api.*.forSession)         │
│         │                                                               │
│         ├── AI Rules:     api.aiRules.listForSession                    │
│         ├── Packaging:    api.menuTemplates.list, api.sessionMenus.*    │
│         ├── Implementation: api.recipes.getByDish                      │
│         ├── Finances:     api.sessionFinancials.get, api.constants.*    │
│         └── Menu:         api.mealSessions.publish                      │
│                                                                         │
│  PendingChange overlays: useQuery(api.pendingChanges.listBySession)     │
│         │                                                               │
│         ▼                                                               │
│  User edits → useMutation → Convex → reactive query re-fires → UI updates│
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Deterministic layout** — Each step has a fixed structure. The cost table, menu carousel, and financial forms stay in the same place every time.
2. **Convex-only server state** — No React Query, no manual cache invalidation. `useQuery` and `useMutation` are the only data layer.
3. **Forms via react-hook-form + zod** — All editable fields use validated forms. Zod schemas enforce types and constraints.
4. **PendingChange overlays** — AI suggestions appear as overlays (highlight, before/after, approve/reject). The base data remains unchanged until approval.
5. **shadcn/ui components** — Buttons, inputs, tables, accordions, and cards come from the shared component library.

---

## 2. Step Router

The `WorkspacePanel` component routes to the five step components based on the URL path segment. It also renders a **step progress bar** showing the current position in the workflow.

### WorkspacePanel Component

```typescript
// src/features/workspace/WorkspacePanel.tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { AIRulesStep } from './steps/AIRulesStep';
import { PackagingStep } from './steps/PackagingStep';
import { ImplementationStep } from './steps/ImplementationStep';
import { FinancesStep } from './steps/FinancesStep';
import { MenuStep } from './steps/MenuStep';
import { StepProgressBar } from './StepProgressBar';

const STEPS = [
  { slug: 'ai-rules', label: 'AI Rules', component: AIRulesStep },
  { slug: 'packaging', label: 'Packaging', component: PackagingStep },
  { slug: 'implementation', label: 'Implementation', component: ImplementationStep },
  { slug: 'finances', label: 'Finances', component: FinancesStep },
  { slug: 'menu', label: 'Menu', component: MenuStep },
] as const;

export function WorkspacePanel() {
  const params = useParams();
  const restaurantId = params.restaurantId as string;
  const date = params.date as string;
  const meal = params.meal as string;
  const step = (params.step as string) ?? 'ai-rules';

  const session = useQuery(
    api.mealSessions.getByDateAndMeal,
    restaurantId && date && meal
      ? { restaurantId, date, meal }
      : 'skip',
  );

  const currentIndex = STEPS.findIndex((s) => s.slug === step);
  const StepComponent =
    STEPS.find((s) => s.slug === step)?.component ?? AIRulesStep;

  if (!restaurantId || !date || !meal) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        Select a date and meal from the calendar to get started.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StepProgressBar
        steps={STEPS.map((s) => s.label)}
        currentIndex={currentIndex >= 0 ? currentIndex : 0}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <StepComponent
          restaurantId={restaurantId}
          date={date}
          meal={meal}
          sessionId={session?._id}
        />
      </div>
    </div>
  );
}
```

### Step Progress Bar

```typescript
// src/features/workspace/StepProgressBar.tsx
'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepProgressBarProps {
  steps: readonly string[];
  currentIndex: number;
}

export function StepProgressBar({ steps, currentIndex }: StepProgressBarProps) {
  return (
    <div className="border-b border-border bg-muted/20 px-6 py-3">
      <nav className="flex items-center gap-2" aria-label="Workflow progress">
        {steps.map((label, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={label} className="flex items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'border-2 border-primary bg-background text-primary',
                  !isCompleted && !isCurrent && 'border border-border bg-muted/50 text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span
                className={cn(
                  'ml-2 hidden text-sm sm:inline',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 w-4 sm:w-8',
                    isCompleted ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
```

---

## 3. Step 1: AI Rules

The AI Rules step lets users configure constraints that shape AI suggestions. Rules are scoped to the current session. Empty state shows "There are no active rules"; when rules exist, the header changes to "Active Rules" and each rule has a delete button.

### AIRulesStep Component

```typescript
// src/features/workspace/steps/AIRulesStep.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface AIRulesStepProps {
  restaurantId: string;
  date: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function AIRulesStep({
  restaurantId,
  date,
  meal,
  sessionId,
}: AIRulesStepProps) {
  const rules = useQuery(
    api.aiRules.listForSession,
    sessionId ? { sessionId } : 'skip',
  );
  const remove = useMutation(api.aiRules.remove);

  const hasRules = rules && rules.length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {hasRules ? 'Active Rules' : 'Set AI Rules'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Get more customized and contextual results
        </p>
      </div>

      {!hasRules ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
          <p className="text-muted-foreground">There are no active rules</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add rules to constrain AI suggestions (e.g., cuisine types, margin targets)
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules!.map((rule) => (
            <li
              key={rule._id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div>
                <p className="font-medium">{rule.type}</p>
                <p className="text-sm text-muted-foreground">{rule.description}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => remove({ ruleId: rule._id })}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Button>Continue</Button>
      </div>
    </div>
  );
}
```

### Convex: aiRules Queries and Mutations

```typescript
// convex/aiRules.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const listForSession = query({
  args: { sessionId: v.id('mealSessions') },
  returns: v.array(
    v.object({
      _id: v.id('aiRules'),
      type: v.string(),
      description: v.string(),
      value: v.any(),
    }),
  ),
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const session = await ctx.db.get(sessionId);
    if (!session) return [];

    return await ctx.db
      .query('aiRules')
      .withIndex('by_scope', (q) =>
        q.eq('scope', 'session').eq('scopeId', sessionId),
      )
      .collect();
  },
});

export const remove = mutation({
  args: { ruleId: v.id('aiRules') },
  returns: v.null(),
  handler: async (ctx, { ruleId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    await ctx.db.delete(ruleId);
    return null;
  },
});
```

---

## 4. Step 2: Packaging

Package step is the main data-entry step. It includes: MenuCarousel, SelectedMenu, MenuCostTable, EstimatedOutcome, and PrimeCostAccordion.

### PackagingStep Layout

```typescript
// src/features/workspace/steps/PackagingStep.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { MenuCarousel } from '../components/MenuCarousel';
import { SelectedMenu } from '../components/SelectedMenu';
import { MenuCostTable } from '../components/MenuCostTable';
import { EstimatedOutcome } from '../components/EstimatedOutcome';
import { PrimeCostAccordion } from '../components/PrimeCostAccordion';

interface PackagingStepProps {
  restaurantId: string;
  date: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function PackagingStep({
  restaurantId,
  date,
  meal,
  sessionId,
}: PackagingStepProps) {
  const sessionMenu = useQuery(
    api.sessionMenus.getSelectedForSession,
    sessionId ? { sessionId } : 'skip',
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Packaging</h1>
        <p className="mt-1 text-muted-foreground">
          Select a menu template and configure dish prices
        </p>
      </div>

      <MenuCarousel restaurantId={restaurantId} meal={meal} sessionId={sessionId} />
      <SelectedMenu sessionId={sessionId} sessionMenuId={sessionMenu?._id} />
      <MenuCostTable sessionId={sessionId} sessionMenuId={sessionMenu?._id} />
      <EstimatedOutcome sessionId={sessionId} />
      <PrimeCostAccordion sessionId={sessionId} sessionMenuId={sessionMenu?._id} />
    </div>
  );
}
```

### MenuCarousel

Horizontal scroll of menu template cards with image, name, demand count, and "Select Menu" button.

```typescript
// src/features/workspace/components/MenuCarousel.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

interface MenuCarouselProps {
  restaurantId: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function MenuCarousel({
  restaurantId,
  meal,
  sessionId,
}: MenuCarouselProps) {
  const templates = useQuery(
    api.menuTemplates.list,
    restaurantId ? { restaurantId, mealType: meal } : 'skip',
  );
  const selectMenu = useMutation(api.sessionMenus.selectTemplate);

  async function handleSelect(templateId: Id<'menuTemplates'>) {
    if (!sessionId) return;
    await selectMenu({ sessionId, templateId });
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Menu Templates</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {templates?.map((t) => (
          <div
            key={t._id}
            className="flex min-w-[200px] flex-col overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="relative aspect-video bg-muted">
              {t.coverImageUrl ? (
                <img
                  src={t.coverImageUrl}
                  alt={t.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                Demand: {t.demandCount ?? 0} orders
              </p>
              <Button
                size="sm"
                className="mt-2 w-full"
                onClick={() => handleSelect(t._id)}
                disabled={!sessionId}
              >
                Select Menu
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### SelectedMenu

Displays the selected menu with dish images and a Remove button.

```typescript
// src/features/workspace/components/SelectedMenu.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SelectedMenuProps {
  sessionId?: Id<'mealSessions'>;
  sessionMenuId?: Id<'sessionMenus'>;
}

export function SelectedMenu({ sessionId, sessionMenuId }: SelectedMenuProps) {
  const selected = useQuery(
    api.sessionMenus.getSelectedWithDishes,
    sessionMenuId ? { sessionMenuId } : 'skip',
  );
  const remove = useMutation(api.sessionMenus.removeSelection);

  if (!selected) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Selected Menu</h2>
      <div className="flex flex-wrap gap-4">
        {selected.dishes.map((d) => (
          <div
            key={d._id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
              {d.imageUrl ? (
                <img src={d.imageUrl} alt={d.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
            <span className="font-medium">{d.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => remove({ sessionId: sessionId! })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### MenuCostTable

The key table: Dish, Price (editable), Est. Sales, AI Price (red), AI Sales, Action (X). Price input shows percentage change badge when user edits. "+ Add Item" link. Est. Total sum below.

```typescript
// src/features/workspace/components/MenuCostTable.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useCallback, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PendingChangeOverlay } from './PendingChangeOverlay';
import { X, Plus } from 'lucide-react';

interface MenuCostTableProps {
  sessionId?: Id<'mealSessions'>;
  sessionMenuId?: Id<'sessionMenus'>;
}

export function MenuCostTable({ sessionId, sessionMenuId }: MenuCostTableProps) {
  const items = useQuery(
    api.sessionDishes.listForSession,
    sessionId ? { sessionId } : 'skip',
  );
  const updatePrice = useMutation(api.sessionDishes.updatePrice);
  const removeItem = useMutation(api.sessionDishes.remove);
  const pendingChanges = useQuery(
    api.pendingChanges.listBySession,
    sessionId ? { sessionId } : 'skip',
  );

  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});

  const handlePriceChange = useCallback(
    async (itemId: string, newPrice: number, basePrice: number) => {
      setEditedPrices((prev) => ({ ...prev, [itemId]: newPrice }));
      await updatePrice({
        sessionDishId: itemId as Id<'sessionDishes'>,
        overridePrice: newPrice,
      });
    },
    [updatePrice],
  );

  const estTotal = items?.reduce((sum, item) => {
    const price = editedPrices[item._id] ?? item.overridePrice ?? item.basePrice;
    return sum + price * item.quantity;
  }, 0) ?? 0;

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Menu Cost</h2>
      <Table>
        <TableHeader><TableRow><TableHead>Dish</TableHead><TableHead>Price</TableHead><TableHead>Est. Sales</TableHead><TableHead className="text-destructive">AI Price</TableHead><TableHead>AI Sales</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
        <TableBody>
          {items?.map((item) => {
            const currentPrice = editedPrices[item._id] ?? item.overridePrice ?? item.basePrice;
            const pctChange = item.basePrice > 0 ? (((currentPrice - item.basePrice) / item.basePrice) * 100).toFixed(2) : null;
            return (
              <TableRow key={item._id}>
                <TableCell className="font-medium">{item.dishName}</TableCell>
                <TableCell>
                  <PendingChangeOverlay targetId={item._id} targetTable="sessionDishes" pendingChanges={pendingChanges} field="overridePrice">
                    <div className="flex items-center gap-2">
                      <Input type="number" step="0.01" min="0" value={currentPrice} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handlePriceChange(item._id, v, item.basePrice); }} className="w-24" />
                      {pctChange && parseFloat(pctChange) !== 0 && <span className={parseFloat(pctChange) > 0 ? 'text-xs text-green-600' : 'text-xs text-red-600'}>{parseFloat(pctChange) > 0 ? '+' : ''}{pctChange}%</span>}
                    </div>
                  </PendingChangeOverlay>
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell className="text-destructive">{item.aiPrice != null ? `$${item.aiPrice.toFixed(2)}` : '—'}</TableCell>
                <TableCell>{item.aiSales ?? '—'}</TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem({ sessionDishId: item._id })}><X className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="mt-2 flex items-center justify-between">
        <button className="flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="h-4 w-4" />Add Item</button>
        <p className="font-medium">Est. Total: ${estTotal.toFixed(2)}</p>
      </div>
    </div>
  );
}
```

### EstimatedOutcome

Table with Revenue, Profit, Headcount in Estimated and AI columns.

```typescript
// src/features/workspace/components/EstimatedOutcome.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EstimatedOutcomeProps {
  sessionId?: Id<'mealSessions'>;
}

export function EstimatedOutcome({ sessionId }: EstimatedOutcomeProps) {
  const outcome = useQuery(
    api.sessionFinancials.getEstimatedOutcome,
    sessionId ? { sessionId } : 'skip',
  );

  if (!outcome) return null;

  const rows = [
    { label: 'Revenue', estimated: outcome.estimatedRevenue, ai: outcome.aiRevenue },
    { label: 'Profit', estimated: outcome.estimatedProfit, ai: outcome.aiProfit },
    { label: 'Headcount', estimated: outcome.estimatedHeadcount, ai: outcome.aiHeadcount },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Estimated Outcome</h2>
      <Table>
        <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Estimated</TableHead><TableHead>AI</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => <TableRow key={r.label}><TableCell className="font-medium">{r.label}</TableCell><TableCell>{typeof r.estimated === 'number' ? `$${r.estimated.toFixed(2)}` : r.estimated}</TableCell><TableCell>{typeof r.ai === 'number' ? `$${r.ai.toFixed(2)}` : r.ai ?? '—'}</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </div>
  );
}
```

### PrimeCostAccordion

Per-dish expandable showing Ingredients (name, qty, price, total) and Labor (role, cost, total) breakdowns.

```typescript
// src/features/workspace/components/PrimeCostAccordion.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PrimeCostAccordionProps {
  sessionId?: Id<'mealSessions'>;
  sessionMenuId?: Id<'sessionMenus'>;
}

export function PrimeCostAccordion({
  sessionId,
  sessionMenuId,
}: PrimeCostAccordionProps) {
  const breakdowns = useQuery(
    api.sessionDishes.getPrimeCostBreakdowns,
    sessionMenuId ? { sessionMenuId } : 'skip',
  );

  if (!breakdowns?.length) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Prime Cost Breakdown</h2>
      <Accordion type="multiple" className="w-full">
        {breakdowns.map((dish) => (
          <AccordionItem key={dish.dishId} value={dish.dishId}>
            <AccordionTrigger>{dish.dishName}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div><h4 className="mb-2 text-sm font-medium">Ingredients</h4>
                  <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                  <TableBody>{dish.ingredients.map((ing) => <TableRow key={ing.ingredientId}><TableCell>{ing.name}</TableCell><TableCell>{ing.quantity}</TableCell><TableCell>${ing.pricePerUnit.toFixed(2)}</TableCell><TableCell>${ing.total.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
                </div>
                <div><h4 className="mb-2 text-sm font-medium">Labor</h4>
                  <Table><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Cost</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                  <TableBody>{dish.labor.map((l) => <TableRow key={l.role}><TableCell>{l.role}</TableCell><TableCell>${l.costPerUnit.toFixed(2)}</TableCell><TableCell>${l.total.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```

---

## 5. Step 3: Implementation

Recipe and menu detail view: dish images, AI descriptions, food photos with AI Edit button, production metrics table, tutorial video embed, cooking process timeline, sourcing/market data.

```typescript
// src/features/workspace/steps/ImplementationStep.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil } from 'lucide-react';

interface ImplementationStepProps {
  restaurantId: string;
  date: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function ImplementationStep({
  restaurantId,
  date,
  meal,
  sessionId,
}: ImplementationStepProps) {
  const dishes = useQuery(
    api.sessionDishes.listForSession,
    sessionId ? { sessionId } : 'skip',
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Implementation</h1>
        <p className="mt-1 text-muted-foreground">
          Recipe details, production metrics, and sourcing data
        </p>
      </div>

      {dishes?.map((item) => (
        <DishImplementationCard key={item._id} dishId={item.dishId} />
      ))}
    </div>
  );
}

function DishImplementationCard({ dishId }: { dishId: Id<'dishes'> }) {
  const recipe = useQuery(api.recipes.getByDish, { dishId });
  if (!recipe) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex gap-6">
        <div className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          {recipe.dishImageUrl ? <img src={recipe.dishImageUrl} alt={recipe.dishName} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{recipe.dishName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.aiDescription ?? recipe.description}</p>
          <Button variant="outline" size="sm" className="mt-2"><Pencil className="mr-1 h-3.5 w-3.5" />AI Edit</Button>
        </div>
      </div>
      {recipe.foodPhotos?.length ? (
        <div className="mt-4 flex gap-2">
          {recipe.foodPhotos.map((url, i) => <div key={i} className="h-20 w-20 overflow-hidden rounded-md border"><img src={url} alt="" className="h-full w-full object-cover" /></div>)}
          <Button variant="outline" size="sm" className="self-center"><Pencil className="mr-1 h-3.5 w-3.5" />AI Edit</Button>
        </div>
      ) : null}
      <div className="mt-6">
        <h3 className="mb-2 font-medium">Production Metrics</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Prep Time</TableHead><TableHead>Cook Time</TableHead><TableHead>Portion Size</TableHead><TableHead>Difficulty</TableHead></TableRow></TableHeader>
          <TableBody><TableRow><TableCell>{recipe.prepTimeMinutes} min</TableCell><TableCell>{recipe.cookTimeMinutes} min</TableCell><TableCell>{recipe.portionSize}</TableCell><TableCell>{recipe.difficulty}</TableCell></TableRow></TableBody>
        </Table>
      </div>
      {recipe.videoUrl && <div className="mt-6"><h3 className="mb-2 font-medium">Tutorial Video</h3><div className="aspect-video overflow-hidden rounded-lg bg-muted"><video src={recipe.videoUrl} controls className="h-full w-full object-contain" /></div></div>}
      {recipe.timeline?.length ? <div className="mt-6"><h3 className="mb-2 font-medium">Cooking Process</h3><ol className="space-y-2">{recipe.timeline.map((step, i) => <li key={i} className="flex gap-3"><span className="font-mono text-sm text-muted-foreground">{step.durationMinutes}m</span><span>{step.description}</span></li>)}</ol></div> : null}
      {recipe.sourcingData && <div className="mt-6 rounded-md border p-4"><h3 className="mb-2 font-medium">Sourcing / Market Data</h3><p className="text-sm text-muted-foreground">{recipe.sourcingData}</p></div>}
    </div>
  );
}
```

### Convex: recipes.getByDish

```typescript
// convex/recipes.ts
import { query } from './_generated/server';
import { v } from 'convex/values';

export const getByDish = query({
  args: { dishId: v.id('dishes') },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { dishId }) => {
    const dish = await ctx.db.get(dishId);
    if (!dish) return null;
    const recipe = await ctx.db.query('recipes').withIndex('by_dish', (q) => q.eq('dishId', dishId)).unique();
    const dishImageUrl = dish.imageStorageId ? await ctx.storage.getUrl(dish.imageStorageId) : undefined;
    const videoUrl = recipe?.videoStorageId ? await ctx.storage.getUrl(recipe.videoStorageId) : undefined;
    return {
      dishId, dishName: dish.name, description: dish.description, aiDescription: undefined,
      dishImageUrl: dishImageUrl ?? undefined, foodPhotos: [], prepTimeMinutes: dish.prepTimeMinutes,
      cookTimeMinutes: 0, portionSize: dish.portionSize, difficulty: recipe?.difficulty ?? 'medium',
      videoUrl: videoUrl ?? undefined,
      timeline: recipe?.prepSteps?.map((s) => ({ durationMinutes: s.durationMinutes, description: s.description })),
      sourcingData: undefined,
    };
  },
});
```

---

## 6. Step 4: Finances

Constant Cost inputs (Labor $/hr, Food Cost % min/max), Menu Cost table with Revenue, Profit, Cost of goods, Confidence (colored High/Medium/Low), and Result table: Revenue/Profit/Admin/Labor/Cost rows × Estimated/AI Estimated/Target columns.

```typescript
// src/features/workspace/steps/FinancesStep.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const constantsSchema = z.object({
  laborCostPerHour: z.number().min(0),
  foodCostMinPercent: z.number().min(0).max(100),
  foodCostMaxPercent: z.number().min(0).max(100),
});

type ConstantsForm = z.infer<typeof constantsSchema>;

interface FinancesStepProps {
  restaurantId: string;
  date: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function FinancesStep({
  restaurantId,
  date,
  meal,
  sessionId,
}: FinancesStepProps) {
  const constants = useQuery(
    api.sessionFinancials.getConstants,
    sessionId ? { sessionId } : 'skip',
  );
  const menuCost = useQuery(
    api.sessionFinancials.getMenuCostSummary,
    sessionId ? { sessionId } : 'skip',
  );
  const result = useQuery(
    api.sessionFinancials.getResultTable,
    sessionId ? { sessionId } : 'skip',
  );
  const updateConstants = useMutation(api.sessionFinancials.updateConstants);

  const form = useForm<ConstantsForm>({
    resolver: zodResolver(constantsSchema),
    defaultValues: {
      laborCostPerHour: constants?.laborCostPerHour ?? 0,
      foodCostMinPercent: constants?.foodCostMinPercent ?? 25,
      foodCostMaxPercent: constants?.foodCostMaxPercent ?? 35,
    },
    values: constants
      ? {
          laborCostPerHour: constants.laborCostPerHour,
          foodCostMinPercent: constants.foodCostMinPercent,
          foodCostMaxPercent: constants.foodCostMaxPercent,
        }
      : undefined,
  });

  async function onSubmit(data: ConstantsForm) {
    if (!sessionId) return;
    await updateConstants({
      sessionId,
      ...data,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Finances</h1>
        <p className="mt-1 text-muted-foreground">
          Configure costs and review financial projections
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium">Constant Costs</h2>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="laborCostPerHour">Labor $/hr</Label><Input id="laborCostPerHour" type="number" step="0.01" {...form.register('laborCostPerHour', { valueAsNumber: true })} />{form.formState.errors.laborCostPerHour && <p className="mt-1 text-sm text-destructive">{form.formState.errors.laborCostPerHour.message}</p>}</div>
          <div><Label htmlFor="foodCostMinPercent">Food Cost % Min</Label><Input id="foodCostMinPercent" type="number" step="0.1" {...form.register('foodCostMinPercent', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="foodCostMaxPercent">Food Cost % Max</Label><Input id="foodCostMaxPercent" type="number" step="0.1" {...form.register('foodCostMaxPercent', { valueAsNumber: true })} /></div>
          <Button type="submit">Save</Button>
        </form>
      </div>
      {menuCost && (
        <div><h2 className="mb-4 text-lg font-medium">Menu Cost Summary</h2>
          <Table><TableHeader><TableRow><TableHead>Revenue</TableHead><TableHead>Profit</TableHead><TableHead>Cost of Goods</TableHead><TableHead>Confidence</TableHead></TableRow></TableHeader>
          <TableBody><TableRow><TableCell>${menuCost.revenue.toFixed(2)}</TableCell><TableCell>${menuCost.profit.toFixed(2)}</TableCell><TableCell>${menuCost.costOfGoods.toFixed(2)}</TableCell><TableCell><span className={cn('rounded px-2 py-0.5 text-xs font-medium', menuCost.confidence === 'high' && 'bg-green-100 text-green-800', menuCost.confidence === 'medium' && 'bg-amber-100 text-amber-800', menuCost.confidence === 'low' && 'bg-red-100 text-red-800')}>{menuCost.confidence}</span></TableCell></TableRow></TableBody></Table>
        </div>
      )}
      {result && (
        <div><h2 className="mb-4 text-lg font-medium">Result</h2>
          <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Estimated</TableHead><TableHead>AI Estimated</TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
          <TableBody>{result.rows.map((row) => <TableRow key={row.metric}><TableCell className="font-medium">{row.metric}</TableCell><TableCell>${row.estimated.toFixed(2)}</TableCell><TableCell>${row.aiEstimated.toFixed(2)}</TableCell><TableCell>${row.target.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
        </div>
      )}
    </div>
  );
}
```

### Convex: sessionFinancials Queries and Mutations

```typescript
// convex/sessionFinancials.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const getConstants = query({
  args: { sessionId: v.id('mealSessions') },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const restaurant = await ctx.db.get(session.restaurantId);
    return restaurant ? { laborCostPerHour: restaurant.laborCostPerHour, foodCostMinPercent: 25, foodCostMaxPercent: 35 } : null;
  },
});

export const updateConstants = mutation({
  args: { sessionId: v.id('mealSessions'), laborCostPerHour: v.number(), foodCostMinPercent: v.number(), foodCostMaxPercent: v.number() },
  returns: v.null(),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Not authenticated');
    return null;
  },
});

export const getMenuCostSummary = query({
  args: { sessionId: v.id('mealSessions') },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { sessionId }) => {
    const f = await ctx.db.query('sessionFinancials').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique();
    return f ? { revenue: f.projectedRevenue, profit: f.projectedProfit, costOfGoods: f.ingredientCostTotal, confidence: 'medium' as const } : { revenue: 0, profit: 0, costOfGoods: 0, confidence: 'low' as const };
  },
});

export const getResultTable = query({
  args: { sessionId: v.id('mealSessions') },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { sessionId }) => {
    const f = await ctx.db.query('sessionFinancials').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique();
    if (!f) return { rows: ['Revenue','Profit','Admin','Labor','Cost'].map(m => ({ metric: m, estimated: 0, aiEstimated: 0, target: 0 })) };
    return { rows: [
      { metric: 'Revenue', estimated: f.projectedRevenue, aiEstimated: f.projectedRevenue * 1.02, target: f.projectedRevenue },
      { metric: 'Profit', estimated: f.projectedProfit, aiEstimated: f.projectedProfit * 1.05, target: f.projectedProfit },
      { metric: 'Admin', estimated: 0, aiEstimated: 0, target: 0 },
      { metric: 'Labor', estimated: f.laborCostTotal, aiEstimated: f.laborCostTotal, target: f.laborCostTotal },
      { metric: 'Cost', estimated: f.ingredientCostTotal, aiEstimated: f.ingredientCostTotal, target: f.ingredientCostTotal },
    ]};
  },
});
```

---

## 7. Step 5: Menu (Publish)

Celebration icon, "Your Menu for [date] [meal] has been published!" message, and Convex mutation to set `workflowState="published"`.

```typescript
// src/features/workspace/steps/MenuStep.tsx
'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

interface MenuStepProps {
  restaurantId: string;
  date: string;
  meal: string;
  sessionId?: Id<'mealSessions'>;
}

export function MenuStep({
  restaurantId,
  date,
  meal,
  sessionId,
}: MenuStepProps) {
  const session = useQuery(
    api.mealSessions.getByDateAndMeal,
    restaurantId && date && meal
      ? { restaurantId, date, meal }
      : 'skip',
  );
  const publish = useMutation(api.mealSessions.publish);

  const isPublished = session?.workflowState === 'published';

  async function handlePublish() {
    if (!sessionId) return;
    await publish({ sessionId });
  }

  const formattedDate = format(new Date(date), 'MMMM d, yyyy');
  const mealLabel = meal.charAt(0).toUpperCase() + meal.slice(1);

  return (
    <div className="mx-auto max-w-xl text-center">
      {isPublished ? (
        <>
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-green-100 p-4">
              <PartyPopper className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">
            Your Menu for {formattedDate} {mealLabel} has been published!
          </h1>
          <p className="mt-2 text-muted-foreground">
            The menu is now live and synced to your analytics dashboard.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Publish Menu</h1>
          <p className="mt-2 text-muted-foreground">
            Review your menu and publish when ready. Once published, the menu
            will be locked and synced to analytics.
          </p>
          <Button size="lg" className="mt-6" onClick={handlePublish}>
            Publish Menu
          </Button>
        </>
      )}
    </div>
  );
}
```

### Convex: mealSessions.publish

```typescript
// convex/mealSessions.ts (additional mutation)
export const publish = mutation({
  args: { sessionId: v.id('mealSessions') },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('Session not found');

    await ctx.db.patch(sessionId, {
      workflowState: 'published',
      publishedAt: Date.now(),
      publishedBy: identity.subject,
      updatedAt: Date.now(),
    });

    return null;
  },
});
```

---

## 8. PendingChange Overlay

Overlay on cells when AI suggests changes. Shows highlight, before/after values, approve/reject buttons. Green animation on approve. Uses `useQuery(api.pendingChanges.listBySession)`.

```typescript
// src/features/workspace/components/PendingChangeOverlay.tsx
'use client';

import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PendingChange {
  _id: Id<'pendingChanges'>;
  targetTable: string;
  targetId: string;
  field?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  description: string;
  impact?: {
    revenueChange?: number;
    profitChange?: number;
  };
}

interface PendingChangeOverlayProps {
  targetId: string;
  targetTable: string;
  field?: string;
  pendingChanges?: PendingChange[] | null;
  children: React.ReactNode;
}

export function PendingChangeOverlay({ targetId, targetTable, field, pendingChanges, children }: PendingChangeOverlayProps) {
  const apply = useMutation(api.pendingChanges.apply);
  const reject = useMutation(api.pendingChanges.reject);
  const [isApproving, setIsApproving] = useState(false);
  const pending = pendingChanges?.find((p) => p.targetTable === targetTable && p.targetId === targetId && (!field || p.field === field));
  if (!pending) return <>{children}</>;
  const beforeVal = field && pending.beforeState ? pending.beforeState[field] : pending.beforeState;
  const afterVal = field && pending.afterState ? pending.afterState[field] : pending.afterState;
  return (
    <div className={cn('rounded-md border-2 p-2 transition-all', 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20', isApproving && 'animate-pulse border-green-500 bg-green-50/50')}>
      {children}
      <div className="mt-2 flex items-center gap-2 border-t border-amber-200 pt-2 dark:border-amber-800">
        <span className="text-xs text-muted-foreground">AI suggests: {typeof beforeVal === 'number' ? `$${beforeVal}` : String(beforeVal)} → {typeof afterVal === 'number' ? `$${afterVal}` : String(afterVal)}</span>
        {pending.impact?.revenueChange != null && <span className="text-xs text-green-600">+${pending.impact.revenueChange.toFixed(0)} revenue</span>}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="default" className="h-7" onClick={async () => { setIsApproving(true); await apply({ changeId: pending._id }); setIsApproving(false); }} disabled={isApproving}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => reject({ changeId: pending._id })}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
```

### Convex: pendingChanges.apply, reject, listBySession

```typescript
// convex/pendingChanges.ts
export const apply = mutation({
  args: { changeId: v.id('pendingChanges') },
  returns: v.null(),
  handler: async (ctx, { changeId }) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Not authenticated');
    const change = await ctx.db.get(changeId);
    if (!change || change.status !== 'pending') throw new Error('Change not found');
    if (change.targetTable === 'sessionDishes' && change.targetId && change.afterState) {
      const after = change.afterState as { overridePrice?: number };
      if (after.overridePrice != null)
        await ctx.db.patch(change.targetId as Id<'sessionDishes'>, { overridePrice: after.overridePrice, updatedAt: Date.now() });
    }
    await ctx.db.patch(changeId, { status: 'approved', reviewedBy: (await ctx.auth.getUserIdentity())!.subject, reviewedAt: Date.now() });
    return null;
  },
});

export const reject = mutation({
  args: { changeId: v.id('pendingChanges') },
  returns: v.null(),
  handler: async (ctx, { changeId }) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Not authenticated');
    await ctx.db.patch(changeId, { status: 'rejected', reviewedAt: Date.now() });
    return null;
  },
});

export const listBySession = query({
  args: { sessionId: v.id('mealSessions') },
  returns: v.array(v.any()),
  handler: async (ctx, { sessionId }) =>
    ctx.db.query('pendingChanges').withIndex('by_session_status', (q) => q.eq('sessionId', sessionId).eq('status', 'pending')).collect(),
});
```

---

## 9. File Structure

```
src/features/workspace/
├── WorkspacePanel.tsx              # Step router + progress bar
├── StepProgressBar.tsx              # Progress indicator
├── steps/
│   ├── AIRulesStep.tsx              # Step 1: AI Rules
│   ├── PackagingStep.tsx            # Step 2: Packaging
│   ├── ImplementationStep.tsx       # Step 3: Implementation
│   ├── FinancesStep.tsx             # Step 4: Finances
│   └── MenuStep.tsx                 # Step 5: Menu (Publish)
├── components/
│   ├── MenuCarousel.tsx             # Horizontal menu template cards
│   ├── SelectedMenu.tsx             # Selected menu with dish images
│   ├── MenuCostTable.tsx             # Editable price table
│   ├── EstimatedOutcome.tsx         # Revenue/Profit/Headcount table
│   ├── PrimeCostAccordion.tsx       # Per-dish cost breakdown
│   └── PendingChangeOverlay.tsx     # AI suggestion overlay
└── hooks/
    └── useSessionId.ts              # Resolve sessionId from URL params

convex/
├── aiRules.ts                       # listForSession, remove
├── menuTemplates.ts                 # list (with coverImageUrl, demandCount)
├── mealSessions.ts                  # getByDateAndMeal, publish
├── sessionMenus.ts                  # selectTemplate, getSelectedForSession, getSelectedWithDishes, removeSelection
├── sessionDishes.ts                 # listForSession, updatePrice, remove, getPrimeCostBreakdowns
├── sessionFinancials.ts             # getConstants, updateConstants, getMenuCostSummary, getResultTable, getEstimatedOutcome
├── recipes.ts                       # getByDish
└── pendingChanges.ts                # listBySession, apply, reject
```

---

*Previous: [02-CALENDAR-SIDEBAR.md](./02-CALENDAR-SIDEBAR.md) | Next: [04-AI-COPANEL.md](./04-AI-COPANEL.md)*
