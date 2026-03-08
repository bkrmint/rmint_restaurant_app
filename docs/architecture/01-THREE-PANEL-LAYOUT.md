# Three-Panel Layout Shell

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)
**Depends On:** None (foundational)

---

## Table of Contents

1. [Layout Architecture](#1-layout-architecture)
2. [Panel Coordination](#2-panel-coordination)
3. [Responsive Behavior](#3-responsive-behavior)
4. [Layout Component Code](#4-layout-component-code)
5. [Route Structure](#5-route-structure)
6. [File Structure](#6-file-structure)

---

## 1. Layout Architecture

The app uses a three-panel horizontal flex layout. The Calendar Sidebar (left) provides temporal navigation. The Workspace Panel (center) holds the active workflow step. The AI Co-Worker Panel (right) provides proactive suggestions and chat.

### Panel Widths

| Panel | Min Width | Default | Max Width | Behavior |
|-------|-----------|---------|-----------|----------|
| Calendar Sidebar | 200px | 240px | 280px | Resizable via drag handle, collapsible |
| Workspace Panel | 480px | flex-1 | Unlimited | Fills remaining space |
| AI Co-Worker Panel | 320px | 360px | 380px | Collapsible, fixed width options |

### Layout Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Root Layout: ConvexProvider → ThemeProvider → AuthGuard               │
├──────────┬──────────────────────────────────┬──────────────────────────┤
│          │                                  │                          │
│ CALENDAR │         WORKSPACE PANEL          │     AI CO-WORKER         │
│ SIDEBAR  │         (flex-1)                 │     PANEL                │
│          │                                  │                          │
│ 200-280px│  ┌────────────────────────────┐  │  320-380px               │
│ resizable│  │  Workflow Step Tabs         │  │  collapsible             │
│          │  │  [AI Rules|Packaging|...]   │  │                          │
│ ┌──────┐ │  ├────────────────────────────┤  │  ┌────────────────────┐  │
│ │Picker│ │  │                            │  │  │ Context Header     │  │
│ └──────┘ │  │                            │  │  ├────────────────────┤  │
│ ┌──────┐ │  │  Step Content              │  │  │ Proactive Cards    │  │
│ │ Mini │ │  │  (Forms, Tables,           │  │  │ ┌────────────────┐ │  │
│ │ Cal  │ │  │   Carousels)               │  │  │ │ Price Alert    │ │  │
│ └──────┘ │  │                            │  │  │ │ [Apply] [Skip] │ │  │
│ ┌──────┐ │  │                            │  │  │ └────────────────┘ │  │
│ │Range │ │  │                            │  │  ├────────────────────┤  │
│ └──────┘ │  │                            │  │  │ Chat Messages      │  │
│ ┌──────┐ │  │                            │  │  │                    │  │
│ │Session│ │  │                            │  │  │                    │  │
│ │ Tree │ │  └────────────────────────────┘  │  ├────────────────────┤  │
│ │      │ │                                  │  │ [Type message...]  │  │
│ └──────┘ │                                  │  └────────────────────┘  │
│          │                                  │                          │
├──────────┴──────────────────────────────────┴──────────────────────────┤
│  ↕ Resize handle between Calendar Sidebar and Workspace              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Panel Boundaries

Each panel is a **self-contained React tree** that reads its own Convex queries. Panels never pass props to each other and never share React context. Coordination happens exclusively through Convex reactive queries -- when one panel writes data, other panels that query the same data automatically re-render.

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│ Calendar │      │  Workspace   │      │  AI Co-Worker│
│ Sidebar  │      │  Panel       │      │  Panel       │
│          │      │              │      │              │
│ useQuery ├──┐   │ useQuery ────┤──┐   │ useQuery ────┤──┐
│ (sessions│  │   │ (session,    │  │   │ (thread,     │  │
│  by date)│  │   │  items,      │  │   │  alerts,     │  │
│          │  │   │  costs)      │  │   │  pending)    │  │
└──────────┘  │   └──────────────┘  │   └──────────────┘  │
              │                     │                      │
              ▼                     ▼                      ▼
         ┌──────────────────────────────────────────────┐
         │            CONVEX REACTIVE DATABASE           │
         │                                              │
         │  mealSessions  menuItems  costs  threads     │
         │  pendingChanges  proactiveAlerts  aiRules     │
         └──────────────────────────────────────────────┘
```

---

## 2. Panel Coordination

Panels communicate through two mechanisms: **URL state** (Next.js route params) and **Convex reactive queries** (shared database). No prop drilling, no React context, no event emitters.

### Coordination Pattern: Calendar → Workspace → AI

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Clicks "March 10 → Dinner → Finances" in Calendar        │
│                                                                        │
│ 1. Calendar Sidebar                                                    │
│    └─ router.push(`/${restaurantId}/plan/2026-03-10/dinner/finances`)  │
│                                                                        │
│ 2. URL updates → Next.js re-renders Workspace page                     │
│    └─ [date]/[meal]/finances/page.tsx reads params                     │
│    └─ useQuery(api.mealSessions.getByDateAndMeal, { date, meal })     │
│    └─ Workspace renders FinancesStep with session data                 │
│                                                                        │
│ 3. AI Co-Worker reads same route params                                │
│    └─ useQuery(api.aiThreads.getForSession, { sessionId })            │
│    └─ useQuery(api.proactiveAlerts.forSession, { sessionId })         │
│    └─ AI panel shows session-specific thread + alerts                  │
│                                                                        │
│ RESULT: All three panels are in sync, driven by URL + Convex           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Coordination Pattern: AI Apply → Workspace Update

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Clicks "Apply" on AI suggestion to change dish price      │
│                                                                        │
│ 1. AI Panel                                                            │
│    └─ useMutation(api.pendingChanges.apply, { changeId })             │
│    └─ Convex mutation updates menuItems table                          │
│                                                                        │
│ 2. Workspace Panel (automatic, no code needed)                         │
│    └─ useQuery(api.menuItems.forSession) re-fires                     │
│    └─ Price field updates in-place with diff badge                     │
│                                                                        │
│ 3. Calendar Sidebar (automatic, no code needed)                        │
│    └─ useQuery(api.mealSessions.listByMonth) re-fires                 │
│    └─ Session status indicator updates if workflow state changed        │
│                                                                        │
│ RESULT: One mutation, all panels update. Zero manual cache invalidation│
└─────────────────────────────────────────────────────────────────────────┘
```

### Coordination Pattern: Workspace Edit → AI Reaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Manually changes a dish price in Workspace                │
│                                                                        │
│ 1. Workspace Panel                                                     │
│    └─ useMutation(api.menuItems.updatePrice, { itemId, newPrice })    │
│                                                                        │
│ 2. Convex trigger (database write triggers)                            │
│    └─ Scheduled function detects price change                          │
│    └─ Runs financial impact analysis                                   │
│    └─ Writes proactiveAlert: "Price change impacts margin by -2.3%"   │
│                                                                        │
│ 3. AI Panel (automatic via reactive query)                             │
│    └─ useQuery(api.proactiveAlerts.forSession) receives new alert     │
│    └─ Proactive card appears with optimization suggestion              │
│                                                                        │
│ RESULT: User edits trigger AI analysis without explicit requests       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why No React Context or State Management for Cross-Panel Communication?

| Approach | Problem | Why Not |
|----------|---------|---------|
| React Context | Would require wrapping all panels, creating coupling | Panels should be independent trees |
| Redux / Zustand | Server state duplication, manual sync | Convex already is the source of truth |
| Event Emitter | Manual subscription management, race conditions | Convex subscriptions handle this automatically |
| Prop Drilling | Layout becomes a bottleneck, all data flows through parent | Violates panel independence |
| **Convex Queries** | **None** | **Each panel subscribes independently; database is the bus** |

Jotai is used exclusively for **panel-local ephemeral UI state** (panel open/closed, sidebar width, expand/collapse states) -- never for cross-panel data coordination.

---

## 3. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 768px | Single panel + bottom tab bar |
| Tablet | 768px - 1024px | Two-panel: Workspace + AI (Calendar in hamburger) |
| Desktop | > 1024px | Full three-panel |

### Mobile Layout (< 768px)

```
┌─────────────────────────────┐
│                             │
│      ACTIVE PANEL           │
│      (one at a time)        │
│                             │
│                             │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│  📅  │  📝  │  🤖  │  ⚙️   │
│ Cal  │ Work │  AI  │ More  │
└─────────────────────────────┘
```

Only one panel visible at a time. Bottom tab bar switches between panels. The Calendar opens as a full-screen overlay. The Workspace is the default view. The AI panel slides in from the right.

### Tablet Layout (768px - 1024px)

```
┌─────────────────────────────────────────────────┐
│  ☰  Restaurant Name  │  Mar 10 > Dinner > AI... │
├──────────────────────────────┬──────────────────┤
│                              │                  │
│     WORKSPACE PANEL          │  AI CO-WORKER    │
│     (flex-1)                 │  (320px fixed)   │
│                              │                  │
│                              │                  │
└──────────────────────────────┴──────────────────┘
```

Calendar Sidebar collapses to a hamburger menu (slide-over drawer). Workspace and AI Co-Worker panels stack side by side. AI panel can be toggled closed to give full width to Workspace.

### Desktop Layout (> 1024px)

Full three-panel as shown in the architecture diagram. All panels visible simultaneously. Calendar Sidebar is resizable via drag handle. AI Panel is collapsible via toggle button.

### Responsive Implementation

```typescript
// src/features/layout/hooks/useResponsiveLayout.ts
import { useMediaQuery } from '@/hooks/useMediaQuery';

type LayoutMode = 'mobile' | 'tablet' | 'desktop';

export function useResponsiveLayout() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1024px)');

  const mode: LayoutMode = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  return {
    mode,
    showCalendarSidebar: mode === 'desktop',
    showCalendarDrawer: mode !== 'desktop',
    showAiPanel: mode !== 'mobile',
    showBottomTabs: mode === 'mobile',
  };
}
```

---

## 4. Layout Component Code

### Root Layout (Providers)

```typescript
// src/app/layout.tsx
import { ConvexClientProvider } from '@/providers/ConvexClientProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import '@/styles/globals.css';

export const metadata = {
  title: 'RMINT Restaurant Co-Work',
  description: 'AI-powered restaurant meal planning and optimization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ConvexClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

### Convex Client Provider

```typescript
// src/providers/ConvexClientProvider.tsx
'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ReactNode, useMemo } from 'react';

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
    [],
  );

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

### Workspace Layout (Three-Panel Shell)

```typescript
// src/app/(workspace)/layout.tsx
import { ThreePanelLayout } from '@/features/layout/ThreePanelLayout';
import { AuthGuard } from '@/features/auth/AuthGuard';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <ThreePanelLayout>{children}</ThreePanelLayout>
    </AuthGuard>
  );
}
```

### Jotai Atoms (Panel State)

```typescript
// src/features/layout/atoms.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Panel visibility
export const calendarSidebarOpenAtom = atomWithStorage(
  'rmint:calendarSidebarOpen',
  true,
);
export const aiPanelOpenAtom = atomWithStorage('rmint:aiPanelOpen', true);

// Calendar sidebar width (persisted across sessions)
export const calendarWidthAtom = atomWithStorage('rmint:calendarWidth', 240);

// Mobile active panel
export type MobilePanel = 'calendar' | 'workspace' | 'ai';
export const mobilePanelAtom = atom<MobilePanel>('workspace');

// Panel resize state (transient, not persisted)
export const isResizingAtom = atom(false);
```

### Three-Panel Layout Component

```typescript
// src/features/layout/ThreePanelLayout.tsx
'use client';

import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useRef } from 'react';
import {
  calendarSidebarOpenAtom,
  aiPanelOpenAtom,
  calendarWidthAtom,
  mobilePanelAtom,
  isResizingAtom,
} from './atoms';
import { useResponsiveLayout } from './hooks/useResponsiveLayout';
import { CalendarSidebar } from '@/features/calendar-sidebar/CalendarSidebar';
import { AiCoWorkerPanel } from '@/features/ai-panel/AiCoWorkerPanel';
import { MobileBottomTabs } from './MobileBottomTabs';
import { CalendarDrawer } from './CalendarDrawer';
import { PanelToggleButton } from './PanelToggleButton';
import { cn } from '@/lib/utils';

const MIN_CALENDAR_WIDTH = 200;
const MAX_CALENDAR_WIDTH = 280;
const AI_PANEL_WIDTH = 360;

export function ThreePanelLayout({ children }: { children: React.ReactNode }) {
  const { mode, showCalendarSidebar, showCalendarDrawer, showAiPanel, showBottomTabs } =
    useResponsiveLayout();

  const [calendarOpen, setCalendarOpen] = useAtom(calendarSidebarOpenAtom);
  const [aiOpen, setAiOpen] = useAtom(aiPanelOpenAtom);
  const [calendarWidth, setCalendarWidth] = useAtom(calendarWidthAtom);
  const [isResizing, setIsResizing] = useAtom(isResizingAtom);
  const [mobilePanel, setMobilePanel] = useAtom(mobilePanelAtom);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = calendarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(
          MAX_CALENDAR_WIDTH,
          Math.max(MIN_CALENDAR_WIDTH, startWidth + delta),
        );
        setCalendarWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [calendarWidth, setCalendarWidth, setIsResizing],
  );

  // Mobile: single panel view
  if (mode === 'mobile') {
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex-1 overflow-hidden">
          {mobilePanel === 'calendar' && <CalendarSidebar className="h-full w-full" />}
          {mobilePanel === 'workspace' && (
            <main className="h-full overflow-y-auto">{children}</main>
          )}
          {mobilePanel === 'ai' && <AiCoWorkerPanel className="h-full w-full" />}
        </div>
        <MobileBottomTabs active={mobilePanel} onSelect={setMobilePanel} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex h-dvh overflow-hidden', isResizing && 'select-none')}
    >
      {/* Calendar Sidebar (desktop only, or drawer on tablet) */}
      {showCalendarSidebar && calendarOpen && (
        <>
          <aside
            className="flex-shrink-0 overflow-y-auto border-r border-border bg-muted/30"
            style={{ width: calendarWidth }}
          >
            <CalendarSidebar />
          </aside>

          {/* Resize handle */}
          <div
            className="group relative w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart}
          >
            <div className="absolute inset-y-0 -left-0.5 -right-0.5" />
          </div>
        </>
      )}

      {showCalendarDrawer && (
        <CalendarDrawer open={calendarOpen} onOpenChange={setCalendarOpen} />
      )}

      {/* Workspace Panel (center, takes remaining space) */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar with panel toggles */}
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            {(!showCalendarSidebar || !calendarOpen) && (
              <PanelToggleButton
                side="left"
                open={calendarOpen}
                onToggle={() => setCalendarOpen(!calendarOpen)}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {showAiPanel && (
              <PanelToggleButton
                side="right"
                open={aiOpen}
                onToggle={() => setAiOpen(!aiOpen)}
              />
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>

      {/* AI Co-Worker Panel (right) */}
      {showAiPanel && aiOpen && (
        <aside
          className="flex-shrink-0 overflow-hidden border-l border-border bg-muted/10"
          style={{ width: AI_PANEL_WIDTH }}
        >
          <AiCoWorkerPanel />
        </aside>
      )}
    </div>
  );
}
```

### Mobile Bottom Tabs

```typescript
// src/features/layout/MobileBottomTabs.tsx
'use client';

import { Calendar, FileText, Bot, MoreHorizontal } from 'lucide-react';
import type { MobilePanel } from './atoms';
import { cn } from '@/lib/utils';

interface MobileBottomTabsProps {
  active: MobilePanel;
  onSelect: (panel: MobilePanel) => void;
}

const tabs: { id: MobilePanel; label: string; icon: typeof Calendar }[] = [
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'workspace', label: 'Workspace', icon: FileText },
  { id: 'ai', label: 'AI', icon: Bot },
];

export function MobileBottomTabs({ active, onSelect }: MobileBottomTabsProps) {
  return (
    <nav className="flex h-14 items-center border-t border-border bg-background">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={cn(
            'flex flex-1 flex-col items-center gap-0.5 py-1 text-xs',
            active === id
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
```

### Panel Toggle Button

```typescript
// src/features/layout/PanelToggleButton.tsx
'use client';

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PanelToggleButtonProps {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
}

export function PanelToggleButton({ side, open, onToggle }: PanelToggleButtonProps) {
  const Icon = side === 'left'
    ? open ? PanelLeftClose : PanelLeftOpen
    : open ? PanelRightClose : PanelRightOpen;

  const label = side === 'left'
    ? open ? 'Close calendar' : 'Open calendar'
    : open ? 'Close AI panel' : 'Open AI panel';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side === 'left' ? 'right' : 'left'}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
```

### Calendar Drawer (Tablet/Mobile)

```typescript
// src/features/layout/CalendarDrawer.tsx
'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CalendarSidebar } from '@/features/calendar-sidebar/CalendarSidebar';

interface CalendarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarDrawer({ open, onOpenChange }: CalendarDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Calendar Navigation</SheetTitle>
        </SheetHeader>
        <CalendarSidebar className="h-full" />
      </SheetContent>
    </Sheet>
  );
}
```

---

## 5. Route Structure

### Next.js App Router File Tree

```
src/app/
├── layout.tsx                          # Root: ConvexProvider + ThemeProvider
├── page.tsx                            # Landing page (marketing / redirect)
├── auth/
│   ├── login/page.tsx                  # Login (Clerk / custom)
│   └── logout/page.tsx                 # Logout + cleanup
├── onboarding/
│   ├── page.tsx                        # Onboarding entry
│   ├── restaurant/page.tsx             # Restaurant setup
│   └── preferences/page.tsx            # Initial AI preferences
├── (workspace)/
│   ├── layout.tsx                      # Three-panel shell + AuthGuard
│   ├── [restaurantId]/
│   │   ├── plan/
│   │   │   ├── page.tsx                # Calendar redirect → today's date
│   │   │   └── [date]/
│   │   │       └── [meal]/
│   │   │           ├── page.tsx        # Meal session landing → redirects to ai-rules
│   │   │           ├── ai-rules/
│   │   │           │   └── page.tsx    # Step 1: AI Rules configuration
│   │   │           ├── packaging/
│   │   │           │   └── page.tsx    # Step 2: Menu packaging
│   │   │           ├── implementation/
│   │   │           │   └── page.tsx    # Step 3: Implementation details
│   │   │           ├── finances/
│   │   │           │   └── page.tsx    # Step 4: Financial analysis
│   │   │           └── menu/
│   │   │               └── page.tsx    # Step 5: Final menu review
│   │   ├── settings/
│   │   │   └── page.tsx                # Restaurant-level settings
│   │   └── analytics/
│   │       └── page.tsx                # Restaurant analytics dashboard
│   └── chain/
│       ├── settings/
│       │   └── page.tsx                # Chain-level settings (cascades down)
│       └── restaurants/
│           └── page.tsx                # Multi-restaurant management
```

### Route Parameter Types

```typescript
// src/types/routes.ts
export interface WorkspaceParams {
  restaurantId: string; // Convex Id<"restaurants"> serialized
}

export interface PlanParams extends WorkspaceParams {
  date: string;  // 'yyyy-MM-dd' format
  meal: MealType;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type WorkflowStep =
  | 'ai-rules'
  | 'packaging'
  | 'implementation'
  | 'finances'
  | 'menu';
```

### Plan Page (Calendar Redirect)

```typescript
// src/app/(workspace)/[restaurantId]/plan/page.tsx
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

export default function PlanPage({
  params,
}: {
  params: { restaurantId: string };
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  redirect(`/${params.restaurantId}/plan/${today}/lunch/ai-rules`);
}
```

### Meal Session Page (Step Redirect)

```typescript
// src/app/(workspace)/[restaurantId]/plan/[date]/[meal]/page.tsx
import { redirect } from 'next/navigation';

export default function MealSessionPage({
  params,
}: {
  params: { restaurantId: string; date: string; meal: string };
}) {
  redirect(
    `/${params.restaurantId}/plan/${params.date}/${params.meal}/ai-rules`,
  );
}
```

### Workflow Step Page Example

```typescript
// src/app/(workspace)/[restaurantId]/plan/[date]/[meal]/finances/page.tsx
import { FinancesStep } from '@/features/workspace/steps/FinancesStep';

export default function FinancesPage({
  params,
}: {
  params: { restaurantId: string; date: string; meal: string };
}) {
  return (
    <FinancesStep
      restaurantId={params.restaurantId}
      date={params.date}
      meal={params.meal}
    />
  );
}
```

### URL ↔ Panel Mapping

| URL Pattern | Calendar Shows | Workspace Shows | AI Context |
|------------|---------------|-----------------|------------|
| `/[rid]/plan` | Current month, today highlighted | Redirect to today | N/A |
| `/[rid]/plan/2026-03-10/dinner/ai-rules` | March, 10th selected | AI Rules editor | Dinner session rules |
| `/[rid]/plan/2026-03-10/dinner/finances` | March, 10th selected | Financial analysis | Dinner financials |
| `/[rid]/settings` | Restaurant picker only | Settings form | N/A |
| `/[rid]/analytics` | Date range picker | Analytics charts | N/A |
| `/chain/settings` | Chain picker | Chain settings | N/A |

---

## 6. File Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── auth/
│   ├── onboarding/
│   ├── (workspace)/
│   │   ├── layout.tsx
│   │   ├── [restaurantId]/
│   │   └── chain/
│   └── globals.css
│
├── features/
│   └── layout/
│       ├── ThreePanelLayout.tsx         # Main three-panel layout component
│       ├── MobileBottomTabs.tsx         # Mobile tab bar
│       ├── PanelToggleButton.tsx        # Sidebar / AI panel toggle buttons
│       ├── CalendarDrawer.tsx           # Sheet drawer for tablet/mobile calendar
│       ├── atoms.ts                     # Jotai atoms for panel state
│       └── hooks/
│           └── useResponsiveLayout.ts   # Breakpoint detection hook
│
├── providers/
│   ├── ConvexClientProvider.tsx          # Convex React client setup
│   └── ThemeProvider.tsx                # next-themes wrapper
│
├── hooks/
│   └── useMediaQuery.ts                # Generic media query hook
│
├── components/
│   └── ui/                             # shadcn/ui components
│       ├── button.tsx
│       ├── sheet.tsx
│       ├── tooltip.tsx
│       └── sonner.tsx
│
├── lib/
│   └── utils.ts                        # cn() and shared utilities
│
├── styles/
│   └── globals.css                     # Tailwind imports + CSS variables
│
└── types/
    └── routes.ts                       # Route param type definitions
```

---

## Navigation

| Previous | Up | Next |
|----------|-----|------|
| [00-OVERVIEW.md](./00-OVERVIEW.md) | [Document Index](./00-OVERVIEW.md#7-document-index) | [02-CALENDAR-SIDEBAR.md](./02-CALENDAR-SIDEBAR.md) |
