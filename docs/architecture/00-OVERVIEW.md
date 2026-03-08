# RMINT Restaurant Co-Work: Architecture Overview

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Reference:** Adapted from RMINT V5 Agentic Canvas Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Insight: Structured Workspace + AI Co-Worker](#2-core-insight-structured-workspace--ai-co-worker)
3. [Architecture Overview](#3-architecture-overview)
4. [The Seven Layers](#4-the-seven-layers)
5. [Technology Stack](#5-technology-stack)
6. [Key Architectural Decisions](#6-key-architectural-decisions)
7. [Document Index](#7-document-index)

---

## 1. Executive Summary

RMINT Restaurant Co-Work is a **restaurant meal planning and optimization platform** where AI agents proactively assist restaurant operators with menu design, cost optimization, demand forecasting, and financial analysis. The app combines three panels: a **Google Calendar-style sidebar** for temporal navigation, a **structured workspace** for deterministic data entry, and a **proactive AI co-worker panel** that suggests, analyzes, and modifies the workspace with user approval.

### What This App Does

Restaurant operators (chain managers, head chefs, operations managers) use this app to:

1. **Plan menus** for upcoming meal sessions (breakfast, lunch, dinner) across multiple dates
2. **Set AI rules** that constrain how the AI makes suggestions (e.g., "only Indian cuisines", "min 30% profit margin")
3. **Package meals** by selecting from menu templates and configuring individual dish prices
4. **Analyze costs** with detailed ingredient and labor cost breakdowns
5. **Optimize financials** with AI-driven price suggestions, demand forecasting, and what-if analysis
6. **Publish menus** after review with full financial projections

### The AI Co-Worker

Unlike a traditional chat sidebar, the AI co-worker is **proactive** -- it monitors the workspace, detects opportunities, and pushes suggestions without being asked. It can:

- Suggest price changes with revenue/profit impact badges
- Alert on ingredient cost fluctuations with substitution recommendations
- Forecast demand based on historical patterns, events, and seasonality
- Analyze food images and suggest recipe improvements (multimodal via Gemini)
- Run what-if scenarios ("What if labor costs increase $5/hr?")

All AI suggestions pass through a **Rules Engine** that filters based on user-defined constraints, and require explicit **user approval** via an Apply button before modifying the workspace.

### Architecture Summary

| Layer | Count | What |
|-------|-------|------|
| Panels | 3 | Calendar Sidebar, Workspace, AI Co-Worker |
| Workflow Steps | 5 | AI Rules, Packaging, Implementation, Finances, Menu |
| Capability Agents | 5 | Menu Planner, Cost Optimizer, Demand Forecaster, Recipe Expert, Financial Analyst |
| Orchestrator | 1 | Routes user queries to appropriate capability agent |
| AI Models | 2+ | Claude (reasoning), Gemini (multimodal), plus specialized |
| Primary Database | 1 | Convex (reactive, real-time, zero boilerplate) |
| Analytics Database | 1 | Neon PostgreSQL (complex SQL aggregations) |
| Rules Engine | 1 | Deterministic filter for all AI suggestions |

### Key Outcomes

- **Calendar-driven planning**: Every meal session is a date + meal type, navigated like Google Calendar
- **AI is proactive, not passive**: Agents push suggestions, alerts, and optimizations without being asked
- **User controls AI via rules**: Explicit constraints shape what the AI suggests
- **Approval workflow**: All AI modifications require explicit user approval (Apply button)
- **Zero data-layer boilerplate**: Convex eliminates API routes, React Query, cache invalidation, SSE, and WebSocket code
- **Multi-model intelligence**: Claude for reasoning, Gemini for multimodal, specialized models for forecasting
- **Chain hierarchy**: Chain-level settings cascade to individual restaurants with per-restaurant overrides

---

## 2. Core Insight: Structured Workspace + AI Co-Worker

### V5 vs Restaurant Co-Work

RMINT V5 (the RWA tokenization platform) pioneered the "Agentic Canvas" where **AI agents compose the entire UI** as streaming documents. That works for data-heavy dashboards where layout varies by context.

Restaurant Co-Work takes a different approach: the **workspace is structured and deterministic** (forms, tables, menus stay in predictable positions), and the **AI assists from a dedicated panel**. This is because:

1. **Restaurant operators need consistency**: The cost table, menu carousel, and financial forms must be in the same place every time. Operators build muscle memory around these layouts.
2. **Data entry is the primary action**: Unlike V5 where reading dashboards is primary, here operators actively edit prices, select menus, and configure costs. Structured forms are better for this.
3. **AI suggestions need separation**: When the AI suggests a price change, the operator needs to see it alongside (not replacing) the current state. A separate panel with Apply buttons achieves this.

### The Three-Panel Model

```
+--------------------+-----------------------------+---------------------+
| CALENDAR SIDEBAR   |      WORKSPACE PANEL        |   AI CO-WORKER      |
| (200-280px)        |      (flex-1)               |   (320-380px)       |
|--------------------|-----------------------------+---------------------|
|                    |                             |                     |
| Navigate WHEN      | Work on WHAT                | Get help from WHO   |
| (dates, meals)     | (menus, costs, finances)    | (AI agents)         |
|                    |                             |                     |
+--------------------+-----------------------------+---------------------+
```

- **Calendar Sidebar** answers "WHEN": Which date? Which meal? Which workflow step?
- **Workspace Panel** answers "WHAT": The actual data -- menus, prices, costs, financials
- **AI Co-Worker** answers "WHO helps": Proactive suggestions, chat, analysis, Apply actions

### How the Panels Interact

```
Calendar Sidebar                Workspace Panel                AI Co-Worker
     │                              │                              │
     ├── User selects date ──────── │ ── Loads meal session ────── │ ── Loads context
     │   + meal + step              │    for that step             │    for that session
     │                              │                              │
     │                              │ ← User edits price ───────> │ ── AI recalculates
     │                              │                              │    impact, suggests
     │                              │                              │    optimization
     │                              │                              │
     │                              │ <── Apply button ──────────> │ ── User clicks Apply
     │                              │     (price updates,          │    in AI panel
     │                              │      +33% badge appears)     │
     │                              │                              │
     ├── Status updates ──────────> │                              │ ── Proactive alert:
     │   (step completed)           │                              │    "Cost Alert: Potato
     │                              │                              │     prices down 12%"
```

---

## 3. Architecture Overview

```
+------------------------------------------------------------------+
|                 LAYER 7: ANALYTICS SYNC                            |
|                                                                    |
|  Convex scheduled functions sync published session data            |
|  to Neon PostgreSQL for complex SQL analytics queries.             |
+------------------------------------------------------------------+
|                 LAYER 6: PROACTIVE INTELLIGENCE                    |
|                                                                    |
|  Background agents (Convex crons) monitor costs, demand,           |
|  and patterns. Write proactiveAlerts to DB. UI subscribes.         |
+------------------------------------------------------------------+
|                 LAYER 5: RULES ENGINE                              |
|                                                                    |
|  Deterministic filter. All AI suggestions pass through.            |
|  User-defined rules (cuisine, margin, prep time, headcount).       |
+------------------------------------------------------------------+
|                 LAYER 4: AGENT INTELLIGENCE                        |
|                                                                    |
|  Orchestrator + 5 capability agents via Convex + Mastra.           |
|  Multi-model router: Claude (reasoning) + Gemini (multimodal).     |
|  Agent tools are Convex internal functions (direct DB access).     |
+------------------------------------------------------------------+
|                 LAYER 3: AI CO-WORKER PANEL                        |
|                                                                    |
|  Right panel. Chat + proactive cards + suggestion chips.           |
|  Convex Agent component: threads, messages, DB-delta streaming.    |
|  Apply buttons create PendingChanges in Convex.                    |
+------------------------------------------------------------------+
|                 LAYER 2: WORKSPACE PANEL                           |
|                                                                    |
|  Center panel. 5 workflow steps with structured React components.  |
|  Data via Convex useQuery (reactive). Forms via react-hook-form.   |
|  PendingChange overlays show AI-proposed modifications.            |
+------------------------------------------------------------------+
|                 LAYER 1: CALENDAR SIDEBAR                          |
|                                                                    |
|  Left panel. Calendar widget + date range + session tree.          |
|  Restaurant/chain picker. Workflow status indicators.              |
|  All reactive via Convex useQuery.                                 |
+------------------------------------------------------------------+
```

### Data Flow

```
1. User opens app → Calendar Sidebar loads meal sessions for current date range
2. User selects date + meal + step → URL updates, Workspace loads step content
3. Workspace components mount → Convex useQuery fetches data (reactive, auto-updates)
4. AI Co-Worker loads context → Orchestrator agent pre-analyzes session
5. Agent calls capability agents → Menu Planner, Cost Optimizer analyze data
6. Rules Engine filters suggestions → Only compliant suggestions reach the user
7. Suggestions appear as proactive cards in AI panel → User reviews
8. User clicks Apply → Convex mutation updates session data → Workspace auto-updates
9. Background crons monitor costs/demand → Write proactiveAlerts → AI panel shows new alerts
10. User publishes menu → Session marked published → Sync to Neon for analytics
```

---

## 4. The Seven Layers

### Layer 1: Calendar Sidebar (doc: `02-CALENDAR-SIDEBAR.md`)

Google Calendar-inspired left panel for temporal navigation. Mini calendar, date range picker, session tree (date > meal > workflow step), restaurant/chain picker. All reactive via Convex.

### Layer 2: Workspace Panel (doc: `03-WORKSPACE-PANEL.md`)

Structured center panel with 5 workflow steps: AI Rules, Packaging, Implementation, Finances, Menu. Each step renders deterministic React components (forms, tables, carousels). PendingChange overlays show AI-proposed modifications with approve/reject.

### Layer 3: AI Co-Worker Panel (doc: `04-AI-COPANEL.md`)

Right panel with chat, proactive cards, suggestion chips, and Apply buttons. Uses Convex Agent component (`@convex-dev/agents`) for thread management and DB-delta streaming. No SSE or WebSocket needed.

### Layer 4: Agent Intelligence (doc: `05-AGENT-ARCHITECTURE.md`)

Orchestrator agent routes to 5 capability agents: Menu Planner, Cost Optimizer, Demand Forecaster, Recipe Expert, Financial Analyst. Runs inside Convex via `@convex-dev/mastra`. Multi-model router selects Claude or Gemini per task. Agent tools are Convex internal functions with direct DB access.

### Layer 5: Rules Engine (doc: `07-PENDING-CHANGES-AND-RULES.md`)

Deterministic filter that evaluates all AI suggestions against user-defined rules. Rules are scoped to chain, restaurant, or session level. Types include cuisine filters, margin thresholds, prep time limits, headcount requirements, and custom constraints.

### Layer 6: Proactive Intelligence (doc: `07-PENDING-CHANGES-AND-RULES.md`)

Background agents running as Convex scheduled functions. Monitor ingredient prices, analyze demand patterns, detect anomalies. Write `proactiveAlerts` to Convex. UI subscribes reactively -- new alerts appear without polling.

### Layer 7: Analytics Sync (doc: `06-DATA-LAYER.md`)

Convex scheduled functions sync published session data to Neon PostgreSQL for complex SQL analytics: weekly trends, cross-restaurant comparisons, seasonal patterns, moving averages. Financial Analyst agent queries Neon for aggregations.

---

## 5. Technology Stack

### Core Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 14+ (App Router) | Full-stack React framework |
| **Runtime** | Bun | Fast JS runtime |
| **Primary DB** | Convex | Reactive database, serverless functions, real-time sync |
| **Analytics DB** | Neon PostgreSQL + Drizzle | Complex SQL aggregations, historical analytics |
| **AI Agents** | `@convex-dev/agents` + `@convex-dev/mastra` | Agent threads, messages, streaming, durable workflows |
| **AI Orchestration** | Mastra v1 (inside Convex) | Agent framework with tools, model routing |

### AI Models

| Model | Provider | Capability | Used By |
|-------|----------|-----------|---------|
| Claude Sonnet 4 | Anthropic | Reasoning, analysis, optimization | Menu Planner, Cost Optimizer, Demand Forecaster, Financial Analyst |
| Gemini 2.5 Flash | Google | Multimodal (images, video, audio) | Recipe Expert |
| Specialized (TBD) | Various | Demand forecasting, price optimization | Demand Forecaster, Cost Optimizer |

### Frontend

| Technology | Purpose |
|-----------|---------|
| Tailwind CSS v4 + shadcn/ui + Radix | Component library and styling |
| Jotai (minimal) | Calendar selection, panel toggles, ephemeral UI state |
| Convex `useQuery` / `useMutation` | All server state (replaces React Query entirely) |
| react-hook-form + zod | Validated forms in workspace steps |
| Recharts | Financial charts, demand visualization |
| date-fns | Date utilities for calendar |

### What Convex Eliminates

| Eliminated | Replaced By |
|-----------|------------|
| Elysia API routes | Convex queries/mutations/actions |
| TanStack React Query | Convex `useQuery` (reactive, auto-updating) |
| SSE streaming endpoints | Convex DB-delta streaming |
| WebSocket infrastructure | Convex reactive queries |
| S3 / Vercel Blob | Convex Storage |
| Cron / worker infrastructure | Convex scheduled functions |
| Manual cache invalidation | Automatic (Convex re-runs affected queries) |

---

## 6. Key Architectural Decisions

### Why Convex + Neon (not just PostgreSQL)?

**Convex** as primary data store eliminates ~70% of backend boilerplate. Every Convex query is reactive -- when data changes, all connected clients see updates instantly. Agent tools are Convex actions that read/write the same database the UI renders from. No HTTP round-trips between agents and data.

**Neon PostgreSQL** as analytics layer handles complex SQL that Convex can't do efficiently: multi-table JOINs, GROUP BY aggregations, window functions for moving averages, cross-restaurant comparisons. Populated via scheduled sync from Convex.

### Why Structured Workspace (not Agent-Composed Canvas)?

Restaurant operators need **predictable, consistent layouts** for data entry tasks. The cost table must always be in the same position. Menu selection must follow the same flow. AI-composed layouts would vary each time, breaking muscle memory.

### Why Capability-Based Agents (not Role-Based)?

V5 had role-based agents (Admin, Investor, Chef) because different users see different views. Restaurant Co-Work has one primary user type (restaurant operator) with different AI capabilities needed per task. A Menu Planner agent knows about cuisines and seasonal items; a Cost Optimizer knows about ingredient prices and margins. The Orchestrator routes to the right capability.

### Why Multi-Model (not Claude-only)?

Food is inherently **multimodal**. Analyzing a food photo, suggesting plating improvements, or processing a recipe video requires vision capabilities that Claude alone doesn't provide. Gemini 2.5 Flash handles multimodal tasks while Claude handles reasoning and analysis.

### Why PendingChange Approval (not Direct AI Modification)?

Trust. Restaurant operators manage real budgets and real menus. AI suggestions that directly modify prices or swap menu items without approval would create trust issues. The Apply button with impact badges (+$450 Revenue, +$190 Profit) gives operators confidence and control.

---

## 7. Document Index

| # | Document | Content | Depends On |
|---|----------|---------|------------|
| **00** | `00-OVERVIEW.md` (this file) | Executive summary, architecture, tech stack, decisions | -- |
| **01** | `01-THREE-PANEL-LAYOUT.md` | Three-panel layout shell, responsive behavior, panel coordination | 00 |
| **02** | `02-CALENDAR-SIDEBAR.md` | Calendar widget, date management, session tree, restaurant picker | 01 |
| **03** | `03-WORKSPACE-PANEL.md` | All 5 workflow steps with component specs and Convex queries | 01, 02 |
| **04** | `04-AI-COPANEL.md` | AI panel, chat, proactive cards, suggestion chips, Apply workflow | 01, 03 |
| **05** | `05-AGENT-ARCHITECTURE.md` | Orchestrator, capability agents, tools, model router, Convex+Mastra | 04 |
| **06** | `06-DATA-LAYER.md` | Convex schema, Neon analytics, dual-DB sync, file storage | All |
| **07** | `07-PENDING-CHANGES-AND-RULES.md` | PendingChange system, Rules Engine, proactive alerts | 03, 04, 05 |
| **08** | `08-IMPLEMENTATION-PHASES.md` | Sprint-by-sprint build plan with deliverables | All |

---

*Next: [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md) -- The layout shell*
