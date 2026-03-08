# Calendar Sidebar

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)
**Depends On:** [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md) (panel shell)

---

## Table of Contents

1. [What is the Calendar Sidebar](#1-what-is-the-calendar-sidebar)
2. [Restaurant / Chain Picker](#2-restaurant--chain-picker)
3. [Calendar Widget](#3-calendar-widget)
4. [Date Range Selector](#4-date-range-selector)
5. [Session Tree](#5-session-tree)
6. [Creating New Sessions](#6-creating-new-sessions)
7. [Workflow Status Indicators](#7-workflow-status-indicators)
8. [Jotai State](#8-jotai-state)
9. [File Structure](#9-file-structure)

---

## 1. What is the Calendar Sidebar

The Calendar Sidebar is the left panel (200-280px, resizable) that provides **Google Calendar-inspired navigation** for temporal meal planning. It answers the question "WHEN am I working?" -- which restaurant, which date(s), which meal, and which workflow step.

### Sidebar Layout

```
┌──────────────────────────┐
│  🏪 Bella Italia      ▾  │  ← Restaurant / Chain Picker
├──────────────────────────┤
│                          │
│      ◀  March 2026  ▶   │  ← Mini Calendar
│  Mo Tu We Th Fr Sa Su    │
│                  1  2    │
│   3  4  5  6  7  8  9   │
│  10 11 12 13 14 15 16   │    (days with sessions have
│  17 18 19 20 21 22 23   │     dot indicators below)
│  24 25 26 27 28 29 30   │
│  31                      │
│                          │
├──────────────────────────┤
│  📅 Mar 10 - Mar 14      │  ← Date Range Selector
│     [Today] [This Week]  │
├──────────────────────────┤
│                          │
│  ▼ Mon, March 10         │  ← Session Tree
│    ☀ Breakfast           │
│      ● AI Rules          │    (● = completed)
│      ● Packaging         │
│      ○ Implementation    │    (○ = not started)
│      ○ Finances          │
│      ○ Menu              │
│    🌤 Lunch         [+]  │
│      ◐ AI Rules          │    (◐ = in progress)
│      ○ Packaging         │
│    🌙 Dinner        [+]  │
│                          │
│  ▶ Tue, March 11    [+]  │  ← Collapsed date
│  ▶ Wed, March 12    [+]  │
│  ▼ Thu, March 13         │
│    🌤 Lunch              │
│      ● AI Rules          │
│      ◐ Packaging         │
│    🌙 Dinner             │
│      ○ AI Rules          │
│  ▶ Fri, March 14    [+]  │
│                          │
└──────────────────────────┘
```

### Design Principles

1. **Always visible on desktop** -- the sidebar is the primary navigation tool, always showing context for where the user is in time.
2. **Reactive via Convex** -- all data (sessions, statuses, restaurant list) comes from `useQuery` hooks that auto-update when data changes.
3. **URL-driven selection** -- clicking a session tree node navigates via `router.push`, which drives the Workspace and AI panels.
4. **Minimal client state** -- only UI concerns (expanded/collapsed, selected dates) live in Jotai atoms; all domain data lives in Convex.

---

## 2. Restaurant / Chain Picker

The topmost element in the sidebar. Shows the currently selected restaurant with a dropdown to switch. Supports multi-restaurant chains with hierarchy.

### Chain Hierarchy

```
Chain: "Bella Restaurant Group"
├── Restaurant: "Bella Italia - Downtown"
├── Restaurant: "Bella Italia - Uptown"
└── Restaurant: "Bella Pizzeria"

Chain-level settings (default cuisine types, margin targets, AI preferences)
cascade to all restaurants. Per-restaurant overrides take precedence.
```

### Convex Query: User's Restaurants

```typescript
// convex/restaurants.ts
import { query } from './_generated/server';
import { v } from 'convex/values';

export const listForUser = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('restaurants'),
      name: v.string(),
      chainId: v.optional(v.id('chains')),
      chainName: v.optional(v.string()),
      role: v.union(v.literal('owner'), v.literal('manager'), v.literal('chef')),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const memberships = await ctx.db
      .query('restaurantMembers')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();

    const restaurants = await Promise.all(
      memberships.map(async (m) => {
        const restaurant = await ctx.db.get(m.restaurantId);
        if (!restaurant) return null;

        let chainName: string | undefined;
        if (restaurant.chainId) {
          const chain = await ctx.db.get(restaurant.chainId);
          chainName = chain?.name;
        }

        return {
          _id: restaurant._id,
          name: restaurant.name,
          chainId: restaurant.chainId,
          chainName,
          role: m.role,
        };
      }),
    );

    return restaurants.filter(Boolean) as NonNullable<(typeof restaurants)[number]>[];
  },
});
```

### Restaurant Picker Component

```typescript
// src/features/calendar-sidebar/RestaurantPicker.tsx
'use client';

import { useQuery } from 'convex/react';
import { useAtom } from 'jotai';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { selectedRestaurantAtom } from './atoms';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function RestaurantPicker() {
  const restaurants = useQuery(api.restaurants.listForUser);
  const [selectedId, setSelectedId] = useAtom(selectedRestaurantAtom);
  const router = useRouter();
  const params = useParams();

  const currentId = (params.restaurantId as string) ?? selectedId;

  const grouped = groupByChain(restaurants ?? []);

  function handleSelect(restaurantId: string) {
    setSelectedId(restaurantId as any);
    router.push(`/${restaurantId}/plan`);
  }

  return (
    <div className="border-b border-border p-3">
      <Select value={currentId ?? undefined} onValueChange={handleSelect}>
        <SelectTrigger className="w-full">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Select restaurant" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {grouped.map((group) => (
            <SelectGroup key={group.chainName ?? 'independent'}>
              {group.chainName && (
                <SelectLabel className="text-xs text-muted-foreground">
                  {group.chainName}
                </SelectLabel>
              )}
              {group.restaurants.map((r) => (
                <SelectItem key={r._id} value={r._id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type Restaurant = NonNullable<ReturnType<typeof useQuery<typeof api.restaurants.listForUser>>>[number];

function groupByChain(restaurants: Restaurant[]) {
  const chains = new Map<string | null, { chainName: string | null; restaurants: Restaurant[] }>();

  for (const r of restaurants) {
    const key = r.chainId ?? null;
    if (!chains.has(key)) {
      chains.set(key, { chainName: r.chainName ?? null, restaurants: [] });
    }
    chains.get(key)!.restaurants.push(r);
  }

  return Array.from(chains.values());
}
```

---

## 3. Calendar Widget

A compact month calendar (similar to Google Calendar's mini calendar). Days that have planned meal sessions display dot indicators beneath the date number. Clicking a day selects it and updates the date range and session tree.

### Visual Layout

```
       ◀  March 2026  ▶
  Mo  Tu  We  Th  Fr  Sa  Su
                       1   2
   3   4   5   6   7   8   9
 [10] 11  12  13  14  15  16
  17  18  19  20  21  22  23
  24  25  26  27  28  29  30
  31
       •       •   •

  [10] = selected day (highlighted)
  •    = dot indicator (has sessions on that day)
```

### Convex Query: Sessions by Month

Fetches all meal sessions in a visible month to determine which days have session dots. Uses an index on `restaurantId` + `date` for efficient range queries.

```typescript
// convex/mealSessions.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const listByMonth = query({
  args: {
    restaurantId: v.id('restaurants'),
    year: v.number(),
    month: v.number(), // 1-12
  },
  returns: v.array(
    v.object({
      _id: v.id('mealSessions'),
      date: v.string(),
      meal: v.union(v.literal('breakfast'), v.literal('lunch'), v.literal('dinner')),
      workflowState: v.string(),
    }),
  ),
  handler: async (ctx, { restaurantId, year, month }) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    const sessions = await ctx.db
      .query('mealSessions')
      .withIndex('by_restaurant_date', (q) =>
        q.eq('restaurantId', restaurantId).gte('date', startDate).lt('date', endDate),
      )
      .collect();

    return sessions.map((s) => ({
      _id: s._id,
      date: s.date,
      meal: s.meal,
      workflowState: s.workflowState,
    }));
  },
});
```

### Calendar Widget Component

```typescript
// src/features/calendar-sidebar/CalendarWidget.tsx
'use client';

import { useQuery } from 'convex/react';
import { useAtom, useAtomValue } from 'jotai';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { api } from '@convex/_generated/api';
import { selectedDateAtom, viewingMonthAtom } from './atoms';
import { selectedRestaurantAtom } from './atoms';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function CalendarWidget() {
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [viewingMonth, setViewingMonth] = useAtom(viewingMonthAtom);
  const restaurantId = useAtomValue(selectedRestaurantAtom);

  const year = viewingMonth.getFullYear();
  const month = viewingMonth.getMonth() + 1;

  const sessions = useQuery(
    api.mealSessions.listByMonth,
    restaurantId ? { restaurantId, year, month } : 'skip',
  );

  const datesWithSessions = new Set(sessions?.map((s) => s.date) ?? []);

  const monthStart = startOfMonth(viewingMonth);
  const monthEnd = endOfMonth(viewingMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const selectedParsed = parseISO(selectedDate);

  return (
    <div className="p-3">
      {/* Month navigation */}
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewingMonth(subMonths(viewingMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(viewingMonth, 'MMMM yyyy')}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewingMonth(addMonths(viewingMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, viewingMonth);
          const isSelected = isSameDay(day, selectedParsed);
          const hasSessions = datesWithSessions.has(dateStr);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={cn(
                'relative flex h-8 w-full flex-col items-center justify-center rounded-md text-sm',
                !isCurrentMonth && 'text-muted-foreground/40',
                isCurrentMonth && 'text-foreground',
                isSelected && 'bg-primary text-primary-foreground',
                !isSelected && isToday && 'font-bold text-primary',
                !isSelected && 'hover:bg-muted',
              )}
            >
              {format(day, 'd')}
              {hasSessions && (
                <span
                  className={cn(
                    'absolute bottom-0.5 h-1 w-1 rounded-full',
                    isSelected ? 'bg-primary-foreground' : 'bg-primary',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

---

## 4. Date Range Selector

Allows the user to pick a single day or drag-select a range for batch planning. The selected range drives the Session Tree below.

### Range Modes

| Mode | Trigger | Example |
|------|---------|---------|
| Single Day | Click a date in calendar | March 10 only |
| Custom Range | Drag across calendar or use date inputs | March 10 - March 14 |
| This Week | Quick-select button | Mon - Sun of current week |
| Today | Quick-select button | Single day |

### Jotai Atoms

```typescript
// These atoms are defined in the sidebar atoms file (see Section 8)
// selectedDateAtom: the primary selected date (drives URL)
// dateRangeAtom: start + end for multi-day views
```

### Date Range Component

```typescript
// src/features/calendar-sidebar/DateRangeSelector.tsx
'use client';

import { useAtom } from 'jotai';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { selectedDateAtom, dateRangeAtom } from './atoms';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDays } from 'lucide-react';

export function DateRangeSelector() {
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [dateRange, setDateRange] = useAtom(dateRangeAtom);

  const rangeLabel =
    dateRange.start === dateRange.end
      ? format(parseISO(dateRange.start), 'MMM d')
      : `${format(parseISO(dateRange.start), 'MMM d')} – ${format(parseISO(dateRange.end), 'MMM d')}`;

  function handleToday() {
    const today = format(new Date(), 'yyyy-MM-dd');
    setSelectedDate(today);
    setDateRange({ start: today, end: today });
  }

  function handleThisWeek() {
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    setDateRange({ start: weekStart, end: weekEnd });
  }

  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{rangeLabel}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleThisWeek}>
          This Week
        </Button>
      </div>
    </div>
  );
}
```

---

## 5. Session Tree

The Session Tree is the core navigation element below the date range selector. It renders an expandable tree hierarchy: **Date headers → Meal type nodes → Workflow step nodes**. Each step shows completion status and clicking a step navigates to that workflow step URL.

### Tree Structure

```
▼ Mon, March 10                        ← Date header (expandable)
  ☀ Breakfast                           ← Meal node with icon
    ● AI Rules                          ← Workflow step (completed)
    ● Packaging                         ← Workflow step (completed)
    ○ Implementation                    ← Workflow step (not started)
    ○ Finances                          ← Workflow step (not started)
    ○ Menu                              ← Workflow step (not started)
  🌤 Lunch                         [+]  ← Meal node with create button
    ◐ AI Rules                          ← Workflow step (in progress)
    ○ Packaging                         ← Workflow step (not started)
  🌙 Dinner                        [+]  ← No sessions yet, can create
▶ Tue, March 11                    [+]  ← Collapsed date
▶ Wed, March 12                    [+]
▼ Thu, March 13
  🌤 Lunch
    ● AI Rules
    ◐ Packaging
  🌙 Dinner
    ○ AI Rules
▶ Fri, March 14                    [+]
```

### Meal Icons

| Meal | Icon | Time Connotation |
|------|------|-----------------|
| Breakfast | ☀ (`Sun`) | Morning |
| Lunch | 🌤 (`CloudSun`) | Midday |
| Dinner | 🌙 (`Moon`) | Evening |

### Workflow Steps (in order)

| Step | URL Slug | Description |
|------|----------|-------------|
| AI Rules | `ai-rules` | Configure constraints for AI suggestions |
| Packaging | `packaging` | Select and configure menu packages |
| Implementation | `implementation` | Prep details, staff, timeline |
| Finances | `finances` | Cost breakdown, pricing, margins |
| Menu | `menu` | Final menu review and publish |

### Convex Query: Sessions for Date Range

```typescript
// convex/mealSessions.ts (additional query)
export const listByDateRange = query({
  args: {
    restaurantId: v.id('restaurants'),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id('mealSessions'),
      date: v.string(),
      meal: v.union(v.literal('breakfast'), v.literal('lunch'), v.literal('dinner')),
      workflowState: v.string(),
      stepStatuses: v.object({
        aiRules: v.string(),
        packaging: v.string(),
        implementation: v.string(),
        finances: v.string(),
        menu: v.string(),
      }),
    }),
  ),
  handler: async (ctx, { restaurantId, startDate, endDate }) => {
    const sessions = await ctx.db
      .query('mealSessions')
      .withIndex('by_restaurant_date', (q) =>
        q
          .eq('restaurantId', restaurantId)
          .gte('date', startDate)
          .lte('date', endDate),
      )
      .collect();

    return sessions.map((s) => ({
      _id: s._id,
      date: s.date,
      meal: s.meal,
      workflowState: s.workflowState,
      stepStatuses: s.stepStatuses,
    }));
  },
});
```

### Session Tree Component

```typescript
// src/features/calendar-sidebar/SessionTree.tsx
'use client';

import { useQuery } from 'convex/react';
import { useAtom, useAtomValue } from 'jotai';
import { useRouter, useParams } from 'next/navigation';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { Sun, CloudSun, Moon, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { api } from '@convex/_generated/api';
import {
  selectedRestaurantAtom,
  dateRangeAtom,
  expandedDatesAtom,
  expandedMealsAtom,
} from './atoms';
import { StatusDot } from './StatusDot';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MealType = 'breakfast' | 'lunch' | 'dinner';

const MEAL_CONFIG: Record<MealType, { icon: typeof Sun; label: string; order: number }> = {
  breakfast: { icon: Sun, label: 'Breakfast', order: 0 },
  lunch: { icon: CloudSun, label: 'Lunch', order: 1 },
  dinner: { icon: Moon, label: 'Dinner', order: 2 },
};

const WORKFLOW_STEPS = [
  { key: 'aiRules', slug: 'ai-rules', label: 'AI Rules' },
  { key: 'packaging', slug: 'packaging', label: 'Packaging' },
  { key: 'implementation', slug: 'implementation', label: 'Implementation' },
  { key: 'finances', slug: 'finances', label: 'Finances' },
  { key: 'menu', slug: 'menu', label: 'Menu' },
] as const;

export function SessionTree() {
  const restaurantId = useAtomValue(selectedRestaurantAtom);
  const dateRange = useAtomValue(dateRangeAtom);
  const [expandedDates, setExpandedDates] = useAtom(expandedDatesAtom);
  const [expandedMeals, setExpandedMeals] = useAtom(expandedMealsAtom);
  const router = useRouter();
  const params = useParams();

  const sessions = useQuery(
    api.mealSessions.listByDateRange,
    restaurantId
      ? { restaurantId, startDate: dateRange.start, endDate: dateRange.end }
      : 'skip',
  );

  if (!restaurantId) return null;

  const days = eachDayOfInterval({
    start: parseISO(dateRange.start),
    end: parseISO(dateRange.end),
  });

  const sessionsByDate = new Map<string, Map<MealType, (typeof sessions extends (infer T)[] | undefined ? T : never)>>();
  for (const session of sessions ?? []) {
    if (!sessionsByDate.has(session.date)) {
      sessionsByDate.set(session.date, new Map());
    }
    sessionsByDate.get(session.date)!.set(session.meal, session);
  }

  const currentDate = params.date as string | undefined;
  const currentMeal = params.meal as string | undefined;

  function toggleDate(dateStr: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  }

  function toggleMeal(key: string) {
    setExpandedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function navigateToStep(date: string, meal: string, step: string) {
    router.push(`/${restaurantId}/plan/${date}/${meal}/${step}`);
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const isExpanded = expandedDates.has(dateStr);
        const dayLabel = format(day, 'EEE, MMMM d');
        const daySessions = sessionsByDate.get(dateStr);
        const hasSessions = daySessions && daySessions.size > 0;

        return (
          <div key={dateStr} className="mb-1">
            {/* Date header */}
            <button
              onClick={() => toggleDate(dateStr)}
              className={cn(
                'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm',
                currentDate === dateStr
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted',
              )}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <span className="flex-1 truncate font-medium">{dayLabel}</span>
              {hasSessions && (
                <span className="text-xs text-muted-foreground">
                  {daySessions.size}
                </span>
              )}
            </button>

            {/* Meal nodes */}
            {isExpanded && (
              <div className="ml-3 border-l border-border pl-2">
                {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((meal) => {
                  const config = MEAL_CONFIG[meal];
                  const MealIcon = config.icon;
                  const session = daySessions?.get(meal);
                  const mealKey = `${dateStr}:${meal}`;
                  const isMealExpanded = expandedMeals.has(mealKey);
                  const isActiveMeal = currentDate === dateStr && currentMeal === meal;

                  return (
                    <div key={meal} className="mb-0.5">
                      {/* Meal header */}
                      <div className="flex items-center">
                        <button
                          onClick={() => {
                            if (session) toggleMeal(mealKey);
                          }}
                          className={cn(
                            'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm',
                            isActiveMeal
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted',
                            !session && 'text-muted-foreground',
                          )}
                        >
                          <MealIcon className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">{config.label}</span>
                        </button>
                        {!session && (
                          <CreateSessionButton
                            restaurantId={restaurantId}
                            date={dateStr}
                            meal={meal}
                          />
                        )}
                      </div>

                      {/* Workflow steps */}
                      {session && isMealExpanded && (
                        <div className="ml-5 py-0.5">
                          {WORKFLOW_STEPS.map((step) => {
                            const status =
                              session.stepStatuses[step.key as keyof typeof session.stepStatuses];

                            return (
                              <button
                                key={step.key}
                                onClick={() => navigateToStep(dateStr, meal, step.slug)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                                  'hover:bg-muted',
                                )}
                              >
                                <StatusDot status={status} />
                                <span>{step.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Create Session Button

```typescript
// src/features/calendar-sidebar/CreateSessionButton.tsx
'use client';

import { useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Id } from '@convex/_generated/dataModel';

interface CreateSessionButtonProps {
  restaurantId: Id<'restaurants'>;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner';
}

export function CreateSessionButton({
  restaurantId,
  date,
  meal,
}: CreateSessionButtonProps) {
  const create = useMutation(api.mealSessions.create);
  const router = useRouter();

  async function handleCreate(e: React.MouseEvent) {
    e.stopPropagation();
    const sessionId = await create({ restaurantId, date, meal });
    router.push(`/${restaurantId}/plan/${date}/${meal}/ai-rules`);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCreate}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Create {meal} session</TooltipContent>
    </Tooltip>
  );
}
```

---

## 6. Creating New Sessions

New meal sessions are created via the "+" button that appears on date headers and empty meal slots. Each session initializes with a default workflow state and empty step statuses.

### Convex Mutation: Create Session

```typescript
// convex/mealSessions.ts (additional mutation)
export const create = mutation({
  args: {
    restaurantId: v.id('restaurants'),
    date: v.string(),
    meal: v.union(v.literal('breakfast'), v.literal('lunch'), v.literal('dinner')),
  },
  returns: v.id('mealSessions'),
  handler: async (ctx, { restaurantId, date, meal }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const existing = await ctx.db
      .query('mealSessions')
      .withIndex('by_restaurant_date_meal', (q) =>
        q.eq('restaurantId', restaurantId).eq('date', date).eq('meal', meal),
      )
      .unique();

    if (existing) {
      throw new Error(`A ${meal} session already exists for ${date}`);
    }

    return await ctx.db.insert('mealSessions', {
      restaurantId,
      date,
      meal,
      workflowState: 'ai_rules',
      stepStatuses: {
        aiRules: 'not_started',
        packaging: 'not_started',
        implementation: 'not_started',
        finances: 'not_started',
        menu: 'not_started',
      },
      createdBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});
```

### Session Lifecycle

```
[+] Create  →  ai_rules (not_started)
                    ↓
              ai_rules (in_progress)  →  User configures rules
                    ↓
              ai_rules (completed)    →  packaging (not_started)
                    ↓
              packaging (in_progress) →  User selects menus
                    ↓
              ... (each step follows same pattern) ...
                    ↓
              menu (completed)        →  Session fully planned
                    ↓
              [Publish] button        →  workflowState = "published"
```

---

## 7. Workflow Status Indicators

Each workflow step displays a visual indicator showing its completion state. These indicators appear in the Session Tree and in the Workspace step tabs.

### Status Types

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| `not_started` | ○ | Gray (`text-muted-foreground`) | Step has no data yet |
| `in_progress` | ◐ | Amber (`text-amber-500`) | User has started but not finished |
| `completed` | ● | Green (`text-green-500`) | Step is done |
| `published` | ✓● | Green with checkmark (`text-green-600`) | Published and locked |

### Status Dot Component

```typescript
// src/features/calendar-sidebar/StatusDot.tsx
import { Check, Circle, CircleDot, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

type StepStatus = 'not_started' | 'in_progress' | 'completed' | 'published';

interface StatusDotProps {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<StepStatus, { icon: typeof Circle; className: string }> = {
  not_started: {
    icon: Circle,
    className: 'text-muted-foreground',
  },
  in_progress: {
    icon: CircleDot,
    className: 'text-amber-500',
  },
  completed: {
    icon: CircleDot,
    className: 'text-green-500',
  },
  published: {
    icon: Check,
    className: 'text-green-600',
  },
};

export function StatusDot({ status, className }: StatusDotProps) {
  const config = STATUS_CONFIG[status as StepStatus] ?? STATUS_CONFIG.not_started;
  const Icon = config.icon;

  return <Icon className={cn('h-3.5 w-3.5', config.className, className)} />;
}
```

### Aggregate Session Status

A date header or meal node shows an aggregate status based on its children:

```typescript
// src/features/calendar-sidebar/utils.ts

type StepStatus = 'not_started' | 'in_progress' | 'completed' | 'published';

interface StepStatuses {
  aiRules: string;
  packaging: string;
  implementation: string;
  finances: string;
  menu: string;
}

export function aggregateSessionStatus(stepStatuses: StepStatuses): StepStatus {
  const values = Object.values(stepStatuses) as StepStatus[];

  if (values.every((s) => s === 'published')) return 'published';
  if (values.every((s) => s === 'completed' || s === 'published')) return 'completed';
  if (values.some((s) => s === 'in_progress' || s === 'completed')) return 'in_progress';
  return 'not_started';
}
```

---

## 8. Jotai State

All sidebar-specific atoms for ephemeral UI state. Domain data (sessions, restaurants) comes from Convex, not Jotai.

```typescript
// src/features/calendar-sidebar/atoms.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import type { Id } from '@convex/_generated/dataModel';

// ── Restaurant Selection ──────────────────────────────────────────────

export const selectedRestaurantAtom = atomWithStorage<Id<'restaurants'> | null>(
  'rmint:selectedRestaurant',
  null,
);

// ── Date Selection ────────────────────────────────────────────────────

const today = format(new Date(), 'yyyy-MM-dd');

export const selectedDateAtom = atom<string>(today);

export const dateRangeAtom = atom<{ start: string; end: string }>({
  start: today,
  end: today,
});

// Derived: when selectedDate changes, auto-update range to single day
export const selectSingleDateAtom = atom(null, (_get, set, date: string) => {
  set(selectedDateAtom, date);
  set(dateRangeAtom, { start: date, end: date });
});

// Select a full week range
export const selectWeekAtom = atom(null, (_get, set, date: string) => {
  const d = new Date(date);
  const start = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const end = format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  set(selectedDateAtom, date);
  set(dateRangeAtom, { start, end });
});

// ── Calendar Widget ───────────────────────────────────────────────────

export const viewingMonthAtom = atom<Date>(new Date());

// ── Tree Expand/Collapse ──────────────────────────────────────────────

export const expandedDatesAtom = atom<Set<string>>(new Set([today]));

export const expandedMealsAtom = atom<Set<string>>(new Set());
```

### Atom Usage Summary

| Atom | Type | Persisted | Purpose |
|------|------|-----------|---------|
| `selectedRestaurantAtom` | `Id<"restaurants"> \| null` | Yes (localStorage) | Currently active restaurant |
| `selectedDateAtom` | `string` (yyyy-MM-dd) | No | Primary selected date |
| `dateRangeAtom` | `{ start, end }` | No | Date range for session tree |
| `viewingMonthAtom` | `Date` | No | Month visible in calendar widget |
| `expandedDatesAtom` | `Set<string>` | No | Which date headers are expanded |
| `expandedMealsAtom` | `Set<string>` | No | Which meal nodes are expanded |
| `selectSingleDateAtom` | Write-only | N/A | Convenience: sets date + range together |
| `selectWeekAtom` | Write-only | N/A | Convenience: sets date + full week range |

### Why Not Store Selection in URL?

The selected date and meal **are** stored in the URL (via Next.js route params like `/[date]/[meal]/`). The Jotai atoms exist for two scenarios:

1. **Calendar widget browsing** -- the user may browse different months in the calendar without changing the active URL (the `viewingMonthAtom` is decoupled from the selected date).
2. **Date range for tree** -- the session tree shows a date range that may be wider than the single active date in the URL.

The URL is the source of truth for what the Workspace and AI panels show. Jotai atoms are UI-only state for the sidebar's internal behavior.

---

## 9. File Structure

```
src/features/calendar-sidebar/
├── CalendarSidebar.tsx              # Root component: composes all sections
├── RestaurantPicker.tsx             # Chain/restaurant dropdown
├── CalendarWidget.tsx               # Mini month calendar
├── DateRangeSelector.tsx            # Date range picker + quick buttons
├── SessionTree.tsx                  # Expandable date > meal > step tree
├── CreateSessionButton.tsx          # "+" button to create new sessions
├── StatusDot.tsx                    # Workflow status indicator icon
├── atoms.ts                        # Jotai atoms for sidebar state
├── utils.ts                        # aggregateSessionStatus, date helpers
└── hooks/
    └── useSessionNavigation.ts     # URL navigation helpers for tree clicks

convex/
├── restaurants.ts                   # listForUser query
└── mealSessions.ts                  # listByMonth, listByDateRange, create
```

### CalendarSidebar Root Component

```typescript
// src/features/calendar-sidebar/CalendarSidebar.tsx
'use client';

import { RestaurantPicker } from './RestaurantPicker';
import { CalendarWidget } from './CalendarWidget';
import { DateRangeSelector } from './DateRangeSelector';
import { SessionTree } from './SessionTree';
import { cn } from '@/lib/utils';

interface CalendarSidebarProps {
  className?: string;
}

export function CalendarSidebar({ className }: CalendarSidebarProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <RestaurantPicker />
      <CalendarWidget />
      <DateRangeSelector />
      <SessionTree />
    </div>
  );
}
```

---

## Navigation

| Previous | Up | Next |
|----------|-----|------|
| [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md) | [Document Index](./00-OVERVIEW.md#7-document-index) | [03-WORKSPACE-PANEL.md](./03-WORKSPACE-PANEL.md) |
