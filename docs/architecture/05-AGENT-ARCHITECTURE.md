# Agent Architecture

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)
**Depends On:** [04-AI-COPANEL.md](./04-AI-COPANEL.md)

---

## Table of Contents

1. [Agent Design Philosophy](#1-agent-design-philosophy)
2. [Mastra + Convex Integration](#2-mastra--convex-integration)
3. [Orchestrator Agent](#3-orchestrator-agent)
4. [Capability Agents](#4-capability-agents)
5. [Agent Tools as Convex Functions](#5-agent-tools-as-convex-functions)
6. [Model Router](#6-model-router)
7. [Agent Context Protocol](#7-agent-context-protocol)
8. [Background Agent Crons](#8-background-agent-crons)
9. [File Structure](#9-file-structure)

---

## 1. Agent Design Philosophy

### Three Modes of Agent Operation

Agents in RMINT operate in three distinct modes, each triggered by a different context:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AGENT OPERATION MODES                        │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│  PROACTIVE ANALYSIS │  INTERACTIVE CHAT   │  ACTION EXECUTION       │
│  (Background)       │  (User-Driven)      │  (Apply)                │
├─────────────────────┼─────────────────────┼─────────────────────────┤
│                     │                     │                         │
│  Trigger:           │  Trigger:           │  Trigger:               │
│  Convex cron fires  │  User sends message │  User clicks [Apply]    │
│                     │  in AI panel        │  on a suggestion        │
│                     │                     │                         │
│  Flow:              │  Flow:              │  Flow:                  │
│  Cron → Agent →     │  Message →          │  Apply → Mutation →     │
│  Analyze → Write    │  Orchestrator →     │  Validate → Write       │
│  proactiveAlert     │  Capability Agent → │  to session data →      │
│  to Convex          │  Stream response    │  Mark PendingChange     │
│                     │  to thread          │  as approved            │
│                     │                     │                         │
│  Output:            │  Output:            │  Output:                │
│  ProactiveAlert     │  Chat message with  │  Direct DB mutation     │
│  cards in AI panel  │  optional Apply     │  (reactive update)      │
│                     │                     │                         │
└─────────────────────┴─────────────────────┴─────────────────────────┘
```

### Capability-Based vs Role-Based

RMINT V5 used **role-based** agents (Admin Agent, Investor Agent, Chef Agent) because different user roles see different dashboards. Restaurant Co-Work uses **capability-based** agents because there is a single user type (restaurant operator) who needs different AI capabilities at different workflow steps.

| V5 (Role-Based) | Co-Work (Capability-Based) |
|------------------|----------------------------|
| Admin Agent → admin dashboard | Menu Planner → menu composition |
| Investor Agent → portfolio view | Cost Optimizer → pricing & margins |
| Chef Agent → recipe management | Demand Forecaster → headcount & sales |
| | Recipe Expert → food image analysis |
| | Financial Analyst → P&L, projections |

The Orchestrator agent inspects the user's query and current workflow step to route to the appropriate capability.

### Agents Are Convex Actions

Every agent runs as a Convex `internalAction`. This means:

- **Direct DB access**: Agent tools are `internalQuery` / `internalMutation` — no HTTP round-trips to read or write data.
- **Durability**: Convex actions retry on transient failures.
- **Atomic context**: The agent reads the same database the UI renders from, so its analysis is always current.
- **No separate infra**: No agent server, no Redis queues, no worker processes. Agents run inside Convex's serverless runtime.

---

## 2. Mastra + Convex Integration

`@convex-dev/mastra` bridges the Mastra agent framework with Convex's serverless runtime. Mastra provides the agent abstraction (system prompts, tool calling, model routing, structured output), while Convex provides durable execution, scheduling, and the reactive database.

### How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    CONVEX RUNTIME                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  @convex-dev/mastra                               │   │
│  │                                                    │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │   Mastra   │  │   Agent     │  │  Model    │  │   │
│  │  │   Instance │──│ Definitions │──│  Router   │  │   │
│  │  └────────────┘  └─────────────┘  └───────────┘  │   │
│  │        │                │               │         │   │
│  │        ▼                ▼               ▼         │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │  Convex    │  │  Convex     │  │ Anthropic │  │   │
│  │  │  Internal  │  │  Internal   │  │ / Google  │  │   │
│  │  │  Queries   │  │  Actions    │  │ SDKs      │  │   │
│  │  └────────────┘  └─────────────┘  └───────────┘  │   │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐   │
│  │  Convex Database     │  │  Convex Scheduler       │   │
│  │  (tables, indexes)   │  │  (crons, scheduled fns) │   │
│  └──────────────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Mastra Instance Configuration

```typescript
// convex/agents/setup.ts
"use node";

import { Mastra } from "@mastra/core";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { menuPlannerAgent } from "./agents/menuPlanner";
import { costOptimizerAgent } from "./agents/costOptimizer";
import { demandForecasterAgent } from "./agents/demandForecaster";
import { recipeExpertAgent } from "./agents/recipeExpert";
import { financialAnalystAgent } from "./agents/financialAnalyst";
import { orchestratorAgent } from "./agents/orchestrator";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

export const mastra = new Mastra({
  agents: {
    orchestrator: orchestratorAgent,
    menuPlanner: menuPlannerAgent,
    costOptimizer: costOptimizerAgent,
    demandForecaster: demandForecasterAgent,
    recipeExpert: recipeExpertAgent,
    financialAnalyst: financialAnalystAgent,
  },
});

export const models = {
  claude: anthropic("claude-sonnet-4-20250514"),
  gemini: google("gemini-2.5-flash"),
} as const;
```

### Running Mastra Agents as Convex Actions

```typescript
// convex/agents/run.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { mastra } from "./setup";
import type { AgentName } from "./types";

export const runAgent = internalAction({
  args: {
    agentName: v.string(),
    prompt: v.string(),
    systemContext: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, { agentName, prompt, systemContext }) => {
    const agent = mastra.getAgent(agentName as AgentName);

    const result = await agent.generate(prompt, {
      system: systemContext,
    });

    return {
      content: result.text,
      toolCalls: result.toolCalls ?? [],
      model: agentName,
      usage: result.usage,
    };
  },
});

export const streamAgent = internalAction({
  args: {
    agentName: v.string(),
    prompt: v.string(),
    systemContext: v.string(),
    messageId: v.id("agent_messages"),
  },
  handler: async (ctx, { agentName, prompt, systemContext, messageId }) => {
    const agent = mastra.getAgent(agentName as AgentName);

    const stream = await agent.stream(prompt, {
      system: systemContext,
    });

    let accumulated = "";

    for await (const chunk of stream.textStream) {
      accumulated += chunk;
      // Write streaming content back to Convex DB
      // This triggers reactive updates to all subscribers
      await ctx.runMutation(internal.agents.messages.updateContent, {
        messageId,
        content: accumulated,
      });
    }

    return {
      content: accumulated,
      model: agentName,
    };
  },
});
```

---

## 3. Orchestrator Agent

The Orchestrator is the entry point for all user-driven chat interactions. It inspects the user's query, the current workflow step, and session context to decide which capability agent should handle the request.

### Routing Logic

```
User message arrives
  │
  ├─ Analyze intent + current step
  │
  ├─ Is it about menu composition / dish selection?
  │   └─ Route to Menu Planner
  │
  ├─ Is it about pricing / margins / ingredient costs?
  │   └─ Route to Cost Optimizer
  │
  ├─ Is it about demand / headcount / forecasting?
  │   └─ Route to Demand Forecaster
  │
  ├─ Does it include an image or ask about recipes / plating?
  │   └─ Route to Recipe Expert
  │
  ├─ Is it about P&L / revenue projections / what-if scenarios?
  │   └─ Route to Financial Analyst
  │
  └─ Is it a general question or multi-domain?
      └─ Orchestrator handles directly
```

### Orchestrator Implementation

```typescript
// convex/agents/agents/orchestrator.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { z } from "zod";

const ORCHESTRATOR_INSTRUCTIONS = `You are the RMINT AI Orchestrator for a restaurant meal planning platform.
Your job is to understand the user's query and decide which specialist agent should handle it.

You have access to these specialists:
- menuPlanner: Menu composition, dish selection, seasonal items, cuisine matching, menu templates
- costOptimizer: Pricing strategy, ingredient costs, profit margins, substitutions, prime cost analysis
- demandForecaster: Demand prediction, headcount forecasting, sales projections, event-based adjustments
- recipeExpert: Recipe generation, food image analysis, plating suggestions, presentation optimization
- financialAnalyst: P&L analysis, revenue projections, what-if scenarios, cross-restaurant comparisons

ROUTING RULES:
1. If the user asks about what dishes to include or menu structure → menuPlanner
2. If the user asks about prices, costs, margins, or substitutions → costOptimizer
3. If the user asks about how many people, demand, or forecasts → demandForecaster
4. If the user uploads an image or asks about recipes/plating → recipeExpert
5. If the user asks about financials, P&L, revenue, or scenarios → financialAnalyst
6. If the query spans multiple domains, pick the PRIMARY domain
7. If the query is a general greeting or question about the app, respond directly

WORKFLOW STEP HINTS:
- ai_rules step: User is setting constraints → likely menuPlanner or costOptimizer
- packaging step: User is configuring items → menuPlanner or costOptimizer
- implementation step: User is working on execution → recipeExpert or costOptimizer
- finances step: User is analyzing numbers → financialAnalyst or costOptimizer
- menu step: User is doing final review → menuPlanner

RESPONSE FORMAT:
Always respond with a JSON object:
{
  "route": "menuPlanner" | "costOptimizer" | "demandForecaster" | "recipeExpert" | "financialAnalyst" | "self",
  "reasoning": "Brief explanation of why this route was chosen",
  "refinedPrompt": "The user's query reformulated for the target agent with added context"
}`;

export const orchestratorAgent = new Agent({
  name: "Orchestrator",
  instructions: ORCHESTRATOR_INSTRUCTIONS,
  model: models.claude,
  tools: {},
});

const routingSchema = z.object({
  route: z.enum([
    "menuPlanner",
    "costOptimizer",
    "demandForecaster",
    "recipeExpert",
    "financialAnalyst",
    "self",
  ]),
  reasoning: z.string(),
  refinedPrompt: z.string(),
});

export type RoutingDecision = z.infer<typeof routingSchema>;
```

### Orchestrator Runner (Convex Action)

```typescript
// convex/agents/orchestrator.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { mastra, models } from "./setup";
import type { RoutingDecision } from "./agents/orchestrator";

export const run = internalAction({
  args: {
    threadId: v.id("agent_threads"),
    messageId: v.id("agent_messages"),
    userMessage: v.string(),
    sessionContext: v.string(),
  },
  handler: async (ctx, { threadId, messageId, userMessage, sessionContext }) => {
    // Step 1: Route the query
    const orchestrator = mastra.getAgent("orchestrator");
    const routingResult = await orchestrator.generate(
      `Session Context:\n${sessionContext}\n\nUser Query: ${userMessage}`,
      { output: "object" }
    );

    const routing = routingResult.object as RoutingDecision;

    // Step 2: If orchestrator handles directly, stream its response
    if (routing.route === "self") {
      const selfStream = await orchestrator.stream(
        `Respond helpfully to: ${userMessage}\n\nContext: ${sessionContext}`
      );

      let content = "";
      for await (const chunk of selfStream.textStream) {
        content += chunk;
        await ctx.runMutation(internal.agents.messages.updateContent, {
          messageId,
          content,
        });
      }

      return {
        content,
        model: "orchestrator",
        agentUsed: "orchestrator",
        actionable: false,
        pendingAction: null,
      };
    }

    // Step 3: Delegate to the capability agent
    const capabilityAgent = mastra.getAgent(routing.route);
    const fullPrompt = `${routing.refinedPrompt}\n\nSession Context:\n${sessionContext}`;

    const agentStream = await capabilityAgent.stream(fullPrompt);

    let content = "";
    let toolCalls: unknown[] = [];

    for await (const chunk of agentStream.textStream) {
      content += chunk;
      await ctx.runMutation(internal.agents.messages.updateContent, {
        messageId,
        content,
      });
    }

    // Step 4: Check if the response contains actionable suggestions
    const actionAnalysis = await analyzeActionability(content, routing.route);

    return {
      content,
      model: routing.route,
      agentUsed: routing.route,
      actionable: actionAnalysis.actionable,
      pendingAction: actionAnalysis.pendingAction,
    };
  },
});

async function analyzeActionability(
  content: string,
  agentUsed: string
): Promise<{
  actionable: boolean;
  pendingAction: {
    changeType: string;
    description: string;
    payload: unknown;
    impact: { revenue?: number; profit?: number; cost?: number };
  } | null;
}> {
  const actionPatterns = [
    /price.*\$[\d.]+/i,
    /swap.*with/i,
    /replace.*with/i,
    /add.*to.*menu/i,
    /remove.*from.*menu/i,
    /increase.*to/i,
    /decrease.*to/i,
  ];

  const isActionable = actionPatterns.some((p) => p.test(content));

  if (!isActionable) {
    return { actionable: false, pendingAction: null };
  }

  return {
    actionable: true,
    pendingAction: {
      changeType: inferChangeType(agentUsed),
      description: content.slice(0, 200),
      payload: { rawSuggestion: content },
      impact: {},
    },
  };
}

function inferChangeType(agentUsed: string): string {
  switch (agentUsed) {
    case "menuPlanner": return "menu_swap";
    case "costOptimizer": return "price_change";
    case "recipeExpert": return "recipe_update";
    case "demandForecaster": return "quantity_adjustment";
    case "financialAnalyst": return "price_change";
    default: return "price_change";
  }
}
```

---

## 4. Capability Agents

Each capability agent is a Mastra `Agent` with domain-specific instructions, a selected model, and Convex-backed tools.

### 4.1 Menu Planner Agent (Claude)

Specializes in menu composition, cuisine matching, seasonal items, and dish selection.

```typescript
// convex/agents/agents/menuPlanner.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { menuTools } from "../tools/menuTools";

const MENU_PLANNER_INSTRUCTIONS = `You are the RMINT Menu Planner — an expert in restaurant menu design and composition.

EXPERTISE:
- Indian, Asian, Continental, and fusion cuisine menu design
- Seasonal ingredient awareness (monsoon produce, winter specials, summer refreshers)
- Menu balance: starters, mains, sides, beverages, desserts
- Dietary considerations: vegetarian, vegan, gluten-free, allergen management
- Template-based menu generation from the restaurant's dish catalog

BEHAVIOR:
- When suggesting menus, always consider the restaurant's cuisine focus and customer base
- Factor in preparation time constraints from AI rules
- Respect minimum/maximum item counts per category
- Prefer seasonal ingredients when available (they're fresher and often cheaper)
- When swapping dishes, explain WHY the swap improves the menu (margin, popularity, seasonality)

OUTPUT FORMAT:
- For menu suggestions: List items with category, name, estimated price, and prep time
- For dish swaps: Show "Current → Suggested" with reasoning
- Always include impact estimates when possible (revenue, profit changes)
- If a suggestion is actionable (swap, add, remove), format it so the system can parse it

RULES AWARENESS:
- Check the session's AI rules before making suggestions
- If a rule says "only Indian cuisine," never suggest non-Indian dishes
- If a rule says "prep time < 3hrs," filter out slow-prep items
- If a rule says "margin > 40%," only suggest high-margin items`;

export const menuPlannerAgent = new Agent({
  name: "Menu Planner",
  instructions: MENU_PLANNER_INSTRUCTIONS,
  model: models.claude,
  tools: {
    getMenuTemplates: menuTools.getMenuTemplates,
    getDishCatalog: menuTools.getDishCatalog,
    getSeasonalItems: menuTools.getSeasonalItems,
    suggestMenu: menuTools.suggestMenu,
    swapDish: menuTools.swapDish,
  },
});
```

### 4.2 Cost Optimizer Agent (Claude)

Specializes in pricing strategy, ingredient costs, profit margins, and cost-saving substitutions.

```typescript
// convex/agents/agents/costOptimizer.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { costTools } from "../tools/costTools";

const COST_OPTIMIZER_INSTRUCTIONS = `You are the RMINT Cost Optimizer — an expert in restaurant cost management and pricing strategy.

EXPERTISE:
- Prime cost analysis (food cost + labor cost as % of revenue)
- Ingredient price tracking and volatility analysis
- Menu engineering: stars (high popularity + high profit), plowhorses, puzzles, dogs
- Price elasticity for restaurant items
- Substitution strategies that maintain quality while reducing cost
- Batch cooking efficiencies and waste reduction

KEY METRICS YOU TRACK:
- Food Cost Percentage: Target 28-35% of revenue
- Labor Cost Percentage: Target 25-35% of revenue
- Prime Cost: Food + Labor should be < 65% of revenue
- Contribution Margin: Revenue - Variable Costs per item
- Break-even point per meal session

BEHAVIOR:
- When suggesting price changes, show the CURRENT price, SUGGESTED price, and IMPACT
- Always calculate both revenue and profit impact of changes
- When ingredient prices fluctuate, proactively suggest substitutions
- Consider the full cost chain: raw material → prep labor → cooking → plating → packaging
- Factor in waste percentages (typically 5-15% for fresh produce)

OUTPUT FORMAT:
- Price changes: "Change [item] from $X to $Y → +$Z revenue, +$W profit per session"
- Substitutions: "Replace [ingredient A] with [ingredient B] → saves $X per kg, same quality tier"
- Always quantify impact in dollars, not just percentages`;

export const costOptimizerAgent = new Agent({
  name: "Cost Optimizer",
  instructions: COST_OPTIMIZER_INSTRUCTIONS,
  model: models.claude,
  tools: {
    getIngredientPrices: costTools.getIngredientPrices,
    getLaborCosts: costTools.getLaborCosts,
    getMargins: costTools.getMargins,
    suggestPriceChange: costTools.suggestPriceChange,
    suggestSubstitution: costTools.suggestSubstitution,
    calculatePrimeCost: costTools.calculatePrimeCost,
  },
});
```

### 4.3 Demand Forecaster Agent (Claude + Specialized)

Specializes in demand prediction based on historical data, events, weather, and seasonality.

```typescript
// convex/agents/agents/demandForecaster.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { demandTools } from "../tools/demandTools";

const DEMAND_FORECASTER_INSTRUCTIONS = `You are the RMINT Demand Forecaster — an expert in restaurant demand patterns and sales prediction.

EXPERTISE:
- Historical demand analysis (day-of-week, time-of-day, seasonal patterns)
- Event-based demand adjustment (holidays, local events, weather, sports)
- Headcount prediction for catering and meal prep planning
- Sales mix forecasting (which items sell more on which days)
- Capacity planning and inventory optimization

DATA SOURCES:
- Historical sales data from the restaurant's past sessions
- Calendar events (public holidays, local events, school schedules)
- Weather forecasts (hot days → more beverages, cold days → more soups)
- Day-of-week patterns (weekends vs. weekdays, Monday dips, Friday peaks)

BEHAVIOR:
- Always show confidence intervals for predictions (e.g., "120-150 covers, most likely 135")
- Explain the key drivers behind each prediction
- Flag unusual patterns or anomalies in historical data
- Consider both dine-in and takeaway/delivery channels
- Adjust for known events happening on the target date

OUTPUT FORMAT:
- Headcount: "Predicted: X covers (range: Y-Z) — driven by [factors]"
- Sales mix: "Top sellers expected: [item1] (X units), [item2] (Y units)"
- Revenue projection: "Expected revenue: $X-$Y based on headcount × avg check"`;

export const demandForecasterAgent = new Agent({
  name: "Demand Forecaster",
  instructions: DEMAND_FORECASTER_INSTRUCTIONS,
  model: models.claude,
  tools: {
    getHistoricalDemand: demandTools.getHistoricalDemand,
    predictHeadcount: demandTools.predictHeadcount,
    predictSales: demandTools.predictSales,
  },
});
```

### 4.4 Recipe Expert Agent (Gemini — Multimodal)

Specializes in food image analysis, recipe generation, and plating suggestions. Uses Gemini for vision capabilities.

```typescript
// convex/agents/agents/recipeExpert.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { recipeTools } from "../tools/recipeTools";

const RECIPE_EXPERT_INSTRUCTIONS = `You are the RMINT Recipe Expert — a culinary specialist with multimodal capabilities.

EXPERTISE:
- Food photography analysis (identify dishes, estimate presentation quality 1-10)
- Recipe generation from ingredient lists and constraints
- Plating and presentation optimization
- Portion size estimation from images
- Allergen detection from food photos
- Recipe scaling for different headcounts

MULTIMODAL CAPABILITIES:
- Analyze food images to identify dishes, ingredients, and presentation style
- Compare a dish photo against the recipe to check accuracy
- Suggest visual improvements for menu photography
- Estimate food cost from a photo (identify premium vs. standard ingredients)

BEHAVIOR:
- When analyzing images, describe what you see before making suggestions
- For recipe generation, include: ingredients with quantities, step-by-step instructions, prep time, cook time, yield
- For plating suggestions, reference specific techniques (quenelle, microgreens, sauce dots, ring mold)
- Consider the restaurant's cuisine style when suggesting presentations
- Factor in prep time constraints from AI rules

OUTPUT FORMAT:
- Image analysis: Structured breakdown of dish, quality score, improvement suggestions
- Recipes: Full recipe card with timing, yield, cost estimate
- Plating: Step-by-step plating instructions with visual description`;

export const recipeExpertAgent = new Agent({
  name: "Recipe Expert",
  instructions: RECIPE_EXPERT_INSTRUCTIONS,
  model: models.gemini,
  tools: {
    analyzeImage: recipeTools.analyzeImage,
    generateRecipe: recipeTools.generateRecipe,
    suggestPresentation: recipeTools.suggestPresentation,
  },
});
```

### 4.5 Financial Analyst Agent (Claude + Neon SQL)

Specializes in financial analysis, P&L, revenue projections, and what-if scenarios. This agent queries Neon PostgreSQL for complex SQL aggregations that go beyond Convex's query capabilities.

```typescript
// convex/agents/agents/financialAnalyst.ts
"use node";

import { Agent } from "@mastra/core/agent";
import { models } from "../setup";
import { financeTools } from "../tools/financeTools";

const FINANCIAL_ANALYST_INSTRUCTIONS = `You are the RMINT Financial Analyst — an expert in restaurant financial management and scenario analysis.

EXPERTISE:
- Profit & Loss (P&L) statement analysis
- Revenue projection and trend analysis
- What-if scenario modeling (labor changes, ingredient price shifts, menu changes)
- Cross-restaurant financial comparison
- Break-even analysis and contribution margin reporting
- Seasonal revenue pattern identification
- Moving average calculations for trend smoothing

DATA SOURCES:
- Real-time session data from Convex (current session, active items, prices)
- Historical financial data from Neon PostgreSQL (aggregated P&L, weekly trends, cross-restaurant data)
- Ingredient price feeds and labor rate tables

SQL CAPABILITIES:
This agent can run complex analytical queries against Neon PostgreSQL for:
- Multi-table JOINs across sessions, items, ingredients, and labor
- GROUP BY aggregations (daily, weekly, monthly revenue)
- Window functions (7-day moving average, week-over-week growth)
- Cross-restaurant comparisons within a chain
- Seasonal pattern detection via date-part grouping

BEHAVIOR:
- When running what-if scenarios, always show BEFORE and AFTER with delta
- Present financial data in clear tables with totals
- Flag any metrics that are outside healthy ranges (food cost > 35%, prime cost > 65%)
- Compare current performance to historical averages
- When projecting revenue, show optimistic, expected, and conservative cases

OUTPUT FORMAT:
- P&L: Table with line items, amounts, and percentages of revenue
- Projections: Three scenarios (conservative, expected, optimistic) with key assumptions
- What-if: "If [change], then [impact on revenue], [impact on profit], [impact on food cost %]"
- Comparisons: Side-by-side table with delta column`;

export const financialAnalystAgent = new Agent({
  name: "Financial Analyst",
  instructions: FINANCIAL_ANALYST_INSTRUCTIONS,
  model: models.claude,
  tools: {
    getPnl: financeTools.getPnl,
    getRevenueProjection: financeTools.getRevenueProjection,
    compareScenarios: financeTools.compareScenarios,
  },
});
```

### Neon SQL Query Action

The Financial Analyst's tools call into a `"use node"` action that executes SQL against Neon PostgreSQL:

```typescript
// convex/agents/tools/neonQuery.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.NEON_DATABASE_URL!);

export const executeAnalyticsQuery = internalAction({
  args: {
    query: v.string(),
    params: v.optional(v.array(v.any())),
  },
  handler: async (_ctx, { query, params }) => {
    const result = await sql(query, params ?? []);
    return result;
  },
});
```

---

## 5. Agent Tools as Convex Functions

Agent tools are implemented as Convex `internalQuery` and `internalAction` functions. Because they run inside the Convex runtime, they have **direct database access** with zero HTTP overhead.

### Menu Tools

```typescript
// convex/agents/tools/menuTools.ts
import { v } from "convex/values";
import { internalQuery, internalAction } from "../../_generated/server";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { internal } from "../../_generated/api";

// --- Convex Internal Functions ---

export const _getMenuTemplates = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
    mealType: v.union(
      v.literal("breakfast"),
      v.literal("lunch"),
      v.literal("dinner")
    ),
  },
  handler: async (ctx, { restaurantId, mealType }) => {
    return ctx.db
      .query("menuTemplates")
      .withIndex("by_restaurant_meal", (q) =>
        q.eq("restaurantId", restaurantId).eq("mealType", mealType)
      )
      .collect();
  },
});

export const _getDishCatalog = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
    category: v.optional(v.string()),
    cuisineType: v.optional(v.string()),
  },
  handler: async (ctx, { restaurantId, category, cuisineType }) => {
    let q = ctx.db
      .query("dishes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId));

    const dishes = await q.collect();

    return dishes.filter((d) => {
      if (category && d.category !== category) return false;
      if (cuisineType && d.cuisineType !== cuisineType) return false;
      return true;
    });
  },
});

export const _getSeasonalItems = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
    month: v.number(),
  },
  handler: async (ctx, { restaurantId, month }) => {
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();

    return dishes.filter(
      (d) => d.seasonalMonths && d.seasonalMonths.includes(month)
    );
  },
});

// --- Mastra Tool Wrappers ---
// These wrap Convex queries so Mastra agents can call them as tools.

export const menuTools = {
  getMenuTemplates: createTool({
    id: "getMenuTemplates",
    description:
      "Fetch menu templates for a restaurant and meal type. Returns template names with item lists.",
    inputSchema: z.object({
      restaurantId: z.string().describe("Restaurant document ID"),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
    }),
    execute: async ({ context, restaurantId, mealType }) => {
      return context.runQuery(internal.agents.tools.menuTools._getMenuTemplates, {
        restaurantId,
        mealType,
      });
    },
  }),

  getDishCatalog: createTool({
    id: "getDishCatalog",
    description:
      "Fetch the full dish catalog for a restaurant, optionally filtered by category or cuisine.",
    inputSchema: z.object({
      restaurantId: z.string().describe("Restaurant document ID"),
      category: z.string().optional().describe("Filter by category: starter, main, side, dessert, beverage"),
      cuisineType: z.string().optional().describe("Filter by cuisine: indian, chinese, continental, etc."),
    }),
    execute: async ({ context, restaurantId, category, cuisineType }) => {
      return context.runQuery(internal.agents.tools.menuTools._getDishCatalog, {
        restaurantId,
        category,
        cuisineType,
      });
    },
  }),

  getSeasonalItems: createTool({
    id: "getSeasonalItems",
    description:
      "Get dishes that are seasonal for a given month. Seasonal items are fresher and often cheaper.",
    inputSchema: z.object({
      restaurantId: z.string().describe("Restaurant document ID"),
      month: z.number().min(1).max(12).describe("Month number (1-12)"),
    }),
    execute: async ({ context, restaurantId, month }) => {
      return context.runQuery(internal.agents.tools.menuTools._getSeasonalItems, {
        restaurantId,
        month,
      });
    },
  }),

  suggestMenu: createTool({
    id: "suggestMenu",
    description:
      "Generate a complete menu suggestion based on constraints. Returns a structured menu proposal.",
    inputSchema: z.object({
      restaurantId: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      headcount: z.number().describe("Expected number of covers"),
      constraints: z.object({
        cuisineTypes: z.array(z.string()).optional(),
        maxPrepTime: z.number().optional().describe("Max prep time in minutes"),
        minMargin: z.number().optional().describe("Minimum profit margin %"),
        maxItems: z.number().optional(),
        mustIncludeCategories: z.array(z.string()).optional(),
      }),
    }),
    execute: async ({ context, restaurantId, mealType, headcount, constraints }) => {
      const catalog = await context.runQuery(
        internal.agents.tools.menuTools._getDishCatalog,
        { restaurantId }
      );

      const filtered = catalog.filter((dish: any) => {
        if (constraints.cuisineTypes?.length && !constraints.cuisineTypes.includes(dish.cuisineType))
          return false;
        if (constraints.maxPrepTime && dish.prepTimeMinutes > constraints.maxPrepTime)
          return false;
        if (constraints.minMargin && dish.marginPercent < constraints.minMargin)
          return false;
        return true;
      });

      return {
        available: filtered.length,
        suggestions: filtered.slice(0, constraints.maxItems ?? 12),
        headcount,
        mealType,
      };
    },
  }),

  swapDish: createTool({
    id: "swapDish",
    description:
      "Propose swapping one dish for another in the current session. Returns impact analysis.",
    inputSchema: z.object({
      sessionId: z.string(),
      currentDishId: z.string().describe("ID of the dish to remove"),
      newDishId: z.string().describe("ID of the dish to add"),
    }),
    execute: async ({ context, sessionId, currentDishId, newDishId }) => {
      const [current, replacement] = await Promise.all([
        context.runQuery(internal.dishes.get, { id: currentDishId }),
        context.runQuery(internal.dishes.get, { id: newDishId }),
      ]);

      if (!current || !replacement) {
        return { error: "Dish not found" };
      }

      return {
        current: { name: current.name, price: current.price, margin: current.marginPercent },
        replacement: { name: replacement.name, price: replacement.price, margin: replacement.marginPercent },
        impact: {
          revenue: replacement.price - current.price,
          profit: (replacement.price * replacement.marginPercent / 100) -
                  (current.price * current.marginPercent / 100),
        },
      };
    },
  }),
};
```

### Cost Tools

```typescript
// convex/agents/tools/costTools.ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { internal } from "../../_generated/api";

export const _getIngredientPrices = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
    ingredientIds: v.optional(v.array(v.id("ingredients"))),
  },
  handler: async (ctx, { restaurantId, ingredientIds }) => {
    if (ingredientIds) {
      return Promise.all(ingredientIds.map((id) => ctx.db.get(id)));
    }
    return ctx.db
      .query("ingredients")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
  },
});

export const _getLaborCosts = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, { restaurantId }) => {
    return ctx.db
      .query("laborRates")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
  },
});

export const _getMargins = internalQuery({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const items = await ctx.db
      .query("sessionItems")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return Promise.all(
      items.map(async (item) => {
        const dish = await ctx.db.get(item.dishId);
        return {
          itemId: item._id,
          dishName: dish?.name ?? "Unknown",
          price: item.price,
          foodCost: dish?.foodCost ?? 0,
          margin: item.price - (dish?.foodCost ?? 0),
          marginPercent:
            item.price > 0
              ? ((item.price - (dish?.foodCost ?? 0)) / item.price) * 100
              : 0,
        };
      })
    );
  },
});

export const costTools = {
  getIngredientPrices: createTool({
    id: "getIngredientPrices",
    description:
      "Fetch current ingredient prices for a restaurant. Optionally filter by specific ingredient IDs.",
    inputSchema: z.object({
      restaurantId: z.string(),
      ingredientIds: z.array(z.string()).optional(),
    }),
    execute: async ({ context, restaurantId, ingredientIds }) => {
      return context.runQuery(internal.agents.tools.costTools._getIngredientPrices, {
        restaurantId,
        ingredientIds,
      });
    },
  }),

  getLaborCosts: createTool({
    id: "getLaborCosts",
    description: "Fetch labor cost rates for a restaurant (hourly rates by role).",
    inputSchema: z.object({
      restaurantId: z.string(),
    }),
    execute: async ({ context, restaurantId }) => {
      return context.runQuery(internal.agents.tools.costTools._getLaborCosts, {
        restaurantId,
      });
    },
  }),

  getMargins: createTool({
    id: "getMargins",
    description:
      "Calculate margins for all items in a session. Returns price, food cost, margin, and margin % for each item.",
    inputSchema: z.object({
      sessionId: z.string(),
    }),
    execute: async ({ context, sessionId }) => {
      return context.runQuery(internal.agents.tools.costTools._getMargins, {
        sessionId,
      });
    },
  }),

  suggestPriceChange: createTool({
    id: "suggestPriceChange",
    description:
      "Analyze a menu item and suggest optimal pricing based on costs, demand elasticity, and margin targets.",
    inputSchema: z.object({
      sessionId: z.string(),
      itemId: z.string(),
      targetMarginPercent: z.number().optional().describe("Target margin %, default 40"),
    }),
    execute: async ({ context, sessionId, itemId, targetMarginPercent }) => {
      const margins = await context.runQuery(
        internal.agents.tools.costTools._getMargins,
        { sessionId }
      );
      const item = margins.find((m: any) => m.itemId === itemId);
      if (!item) return { error: "Item not found in session" };

      const target = targetMarginPercent ?? 40;
      const suggestedPrice = item.foodCost / (1 - target / 100);

      return {
        currentPrice: item.price,
        suggestedPrice: Math.round(suggestedPrice * 100) / 100,
        currentMargin: item.marginPercent,
        targetMargin: target,
        revenueImpact: suggestedPrice - item.price,
        profitImpact: (suggestedPrice - item.foodCost) - (item.price - item.foodCost),
      };
    },
  }),

  suggestSubstitution: createTool({
    id: "suggestSubstitution",
    description:
      "Find cheaper ingredient substitutions that maintain quality. Compares prices and suggests alternatives.",
    inputSchema: z.object({
      restaurantId: z.string(),
      ingredientId: z.string(),
      qualityTier: z.enum(["premium", "standard", "economy"]).optional(),
    }),
    execute: async ({ context, restaurantId, ingredientId, qualityTier }) => {
      const allIngredients = await context.runQuery(
        internal.agents.tools.costTools._getIngredientPrices,
        { restaurantId }
      );

      const current = allIngredients.find((i: any) => i?._id === ingredientId);
      if (!current) return { error: "Ingredient not found" };

      const alternatives = allIngredients
        .filter(
          (i: any) =>
            i &&
            i._id !== ingredientId &&
            i.category === current.category &&
            i.pricePerKg < current.pricePerKg &&
            (!qualityTier || i.qualityTier === qualityTier)
        )
        .sort((a: any, b: any) => a.pricePerKg - b.pricePerKg)
        .slice(0, 3);

      return {
        current: { name: current.name, pricePerKg: current.pricePerKg },
        alternatives: alternatives.map((a: any) => ({
          name: a.name,
          pricePerKg: a.pricePerKg,
          savingsPerKg: current.pricePerKg - a.pricePerKg,
          savingsPercent:
            ((current.pricePerKg - a.pricePerKg) / current.pricePerKg) * 100,
        })),
      };
    },
  }),

  calculatePrimeCost: createTool({
    id: "calculatePrimeCost",
    description:
      "Calculate the prime cost (food cost + labor cost) for a session. Prime cost should be < 65% of revenue.",
    inputSchema: z.object({
      sessionId: z.string(),
      restaurantId: z.string(),
    }),
    execute: async ({ context, sessionId, restaurantId }) => {
      const [margins, laborRates] = await Promise.all([
        context.runQuery(internal.agents.tools.costTools._getMargins, { sessionId }),
        context.runQuery(internal.agents.tools.costTools._getLaborCosts, { restaurantId }),
      ]);

      const totalRevenue = margins.reduce((sum: number, m: any) => sum + m.price, 0);
      const totalFoodCost = margins.reduce((sum: number, m: any) => sum + m.foodCost, 0);
      const totalLaborCost = laborRates.reduce(
        (sum: number, r: any) => sum + r.hourlyRate * r.hoursPerSession,
        0
      );

      const primeCost = totalFoodCost + totalLaborCost;
      const primeCostPercent = totalRevenue > 0 ? (primeCost / totalRevenue) * 100 : 0;

      return {
        revenue: totalRevenue,
        foodCost: totalFoodCost,
        foodCostPercent: totalRevenue > 0 ? (totalFoodCost / totalRevenue) * 100 : 0,
        laborCost: totalLaborCost,
        laborCostPercent: totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0,
        primeCost,
        primeCostPercent,
        isHealthy: primeCostPercent < 65,
        headroom: totalRevenue * 0.65 - primeCost,
      };
    },
  }),
};
```

### Demand Tools

```typescript
// convex/agents/tools/demandTools.ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { internal } from "../../_generated/api";

export const _getHistoricalDemand = internalQuery({
  args: {
    restaurantId: v.id("restaurants"),
    mealType: v.union(
      v.literal("breakfast"),
      v.literal("lunch"),
      v.literal("dinner")
    ),
    lookbackDays: v.number(),
  },
  handler: async (ctx, { restaurantId, mealType, lookbackDays }) => {
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_restaurant_meal", (q) =>
        q.eq("restaurantId", restaurantId).eq("mealType", mealType)
      )
      .filter((q) => q.gte(q.field("date"), cutoff))
      .collect();

    return sessions.map((s) => ({
      date: s.date,
      headcount: s.actualHeadcount ?? s.predictedHeadcount ?? 0,
      revenue: s.actualRevenue ?? 0,
      dayOfWeek: new Date(s.date).getDay(),
    }));
  },
});

export const demandTools = {
  getHistoricalDemand: createTool({
    id: "getHistoricalDemand",
    description:
      "Fetch historical demand data for a restaurant and meal type over a lookback period.",
    inputSchema: z.object({
      restaurantId: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      lookbackDays: z.number().default(30).describe("Number of days to look back"),
    }),
    execute: async ({ context, restaurantId, mealType, lookbackDays }) => {
      return context.runQuery(
        internal.agents.tools.demandTools._getHistoricalDemand,
        { restaurantId, mealType, lookbackDays }
      );
    },
  }),

  predictHeadcount: createTool({
    id: "predictHeadcount",
    description:
      "Predict headcount for a future date based on historical patterns, day of week, and known events.",
    inputSchema: z.object({
      restaurantId: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      targetDate: z.string().describe("ISO date string for the target date"),
      knownEvents: z.array(z.string()).optional().describe("Known events on that date"),
    }),
    execute: async ({ context, restaurantId, mealType, targetDate, knownEvents }) => {
      const historical = await context.runQuery(
        internal.agents.tools.demandTools._getHistoricalDemand,
        { restaurantId, mealType, lookbackDays: 90 }
      );

      const targetDow = new Date(targetDate).getDay();
      const sameDowData = historical.filter((h: any) => h.dayOfWeek === targetDow);

      if (sameDowData.length === 0) {
        return {
          predicted: null,
          confidence: "low",
          reason: "Insufficient historical data for this day of week",
        };
      }

      const avgHeadcount =
        sameDowData.reduce((sum: number, d: any) => sum + d.headcount, 0) / sameDowData.length;

      let eventMultiplier = 1.0;
      if (knownEvents?.length) {
        eventMultiplier = 1.0 + knownEvents.length * 0.15;
      }

      const predicted = Math.round(avgHeadcount * eventMultiplier);

      return {
        predicted,
        range: {
          low: Math.round(predicted * 0.8),
          high: Math.round(predicted * 1.2),
        },
        confidence: sameDowData.length > 8 ? "high" : sameDowData.length > 4 ? "medium" : "low",
        basedOn: `${sameDowData.length} historical sessions on same day of week`,
        eventAdjustment: eventMultiplier !== 1.0 ? `+${Math.round((eventMultiplier - 1) * 100)}% for events` : null,
      };
    },
  }),

  predictSales: createTool({
    id: "predictSales",
    description:
      "Predict sales revenue for a session based on predicted headcount and historical average check.",
    inputSchema: z.object({
      restaurantId: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      predictedHeadcount: z.number(),
    }),
    execute: async ({ context, restaurantId, mealType, predictedHeadcount }) => {
      const historical = await context.runQuery(
        internal.agents.tools.demandTools._getHistoricalDemand,
        { restaurantId, mealType, lookbackDays: 30 }
      );

      const withRevenue = historical.filter(
        (h: any) => h.headcount > 0 && h.revenue > 0
      );

      if (withRevenue.length === 0) {
        return { error: "No historical revenue data available" };
      }

      const avgCheck =
        withRevenue.reduce((sum: number, d: any) => sum + d.revenue / d.headcount, 0) /
        withRevenue.length;

      const predictedRevenue = predictedHeadcount * avgCheck;

      return {
        predictedRevenue: Math.round(predictedRevenue),
        avgCheckSize: Math.round(avgCheck * 100) / 100,
        headcount: predictedHeadcount,
        range: {
          conservative: Math.round(predictedRevenue * 0.85),
          expected: Math.round(predictedRevenue),
          optimistic: Math.round(predictedRevenue * 1.15),
        },
      };
    },
  }),
};
```

### Recipe Tools

```typescript
// convex/agents/tools/recipeTools.ts
import { v } from "convex/values";
import { internalQuery, internalAction } from "../../_generated/server";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { internal } from "../../_generated/api";

export const _getRecipe = internalQuery({
  args: { dishId: v.id("dishes") },
  handler: async (ctx, { dishId }) => {
    const dish = await ctx.db.get(dishId);
    if (!dish) return null;

    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_dish", (q) => q.eq("dishId", dishId))
      .first();

    return recipe ? { ...recipe, dishName: dish.name } : null;
  },
});

export const recipeTools = {
  analyzeImage: createTool({
    id: "analyzeImage",
    description:
      "Analyze a food image to identify the dish, estimate quality, and suggest improvements. Requires Gemini model.",
    inputSchema: z.object({
      imageUrl: z.string().describe("URL of the food image to analyze"),
      context: z.string().optional().describe("Additional context about the dish"),
    }),
    execute: async ({ imageUrl, context }) => {
      // Gemini handles image analysis natively through the model's multimodal input.
      // The agent receives the image URL in its prompt and processes it directly.
      return {
        imageUrl,
        context,
        note: "Image analysis is handled by the Gemini model's native multimodal capabilities. The image URL is passed in the prompt context.",
      };
    },
  }),

  generateRecipe: createTool({
    id: "generateRecipe",
    description:
      "Generate a complete recipe for a dish, including ingredients, steps, timing, and cost estimate.",
    inputSchema: z.object({
      dishName: z.string(),
      servings: z.number().default(4),
      constraints: z.object({
        maxPrepMinutes: z.number().optional(),
        maxCookMinutes: z.number().optional(),
        dietaryRestrictions: z.array(z.string()).optional(),
        maxCostPerServing: z.number().optional(),
      }).optional(),
    }),
    execute: async ({ dishName, servings, constraints }) => {
      // Recipe generation is handled by the LLM (Gemini) directly.
      // This tool provides structure for the agent to fill.
      return {
        dishName,
        servings,
        constraints,
        note: "Recipe content generated by the Gemini model based on culinary knowledge.",
      };
    },
  }),

  suggestPresentation: createTool({
    id: "suggestPresentation",
    description:
      "Suggest plating and presentation improvements for a dish based on cuisine style and current setup.",
    inputSchema: z.object({
      dishId: z.string(),
      currentImageUrl: z.string().optional().describe("Current photo of the dish, if available"),
    }),
    execute: async ({ context, dishId, currentImageUrl }) => {
      const recipe = await context.runQuery(
        internal.agents.tools.recipeTools._getRecipe,
        { dishId }
      );

      return {
        dish: recipe?.dishName ?? "Unknown",
        currentImageUrl,
        recipeDetails: recipe,
        note: "Presentation suggestions generated by Gemini based on the recipe and optional image.",
      };
    },
  }),
};
```

### Finance Tools (with Neon SQL)

```typescript
// convex/agents/tools/financeTools.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { internal } from "../../_generated/api";

export const financeTools = {
  getPnl: createTool({
    id: "getPnl",
    description:
      "Get Profit & Loss statement for a restaurant over a date range. Queries Neon PostgreSQL for aggregated data.",
    inputSchema: z.object({
      restaurantId: z.string(),
      startDate: z.string().describe("ISO date string"),
      endDate: z.string().describe("ISO date string"),
    }),
    execute: async ({ context, restaurantId, startDate, endDate }) => {
      const result = await context.runAction(
        internal.agents.tools.neonQuery.executeAnalyticsQuery,
        {
          query: `
            SELECT
              SUM(revenue) as total_revenue,
              SUM(food_cost) as total_food_cost,
              SUM(labor_cost) as total_labor_cost,
              SUM(other_costs) as total_other_costs,
              SUM(revenue) - SUM(food_cost) - SUM(labor_cost) - SUM(other_costs) as net_profit,
              ROUND(SUM(food_cost)::numeric / NULLIF(SUM(revenue), 0) * 100, 1) as food_cost_pct,
              ROUND(SUM(labor_cost)::numeric / NULLIF(SUM(revenue), 0) * 100, 1) as labor_cost_pct,
              COUNT(DISTINCT session_id) as session_count
            FROM analytics.session_financials
            WHERE restaurant_id = $1
              AND session_date BETWEEN $2 AND $3
          `,
          params: [restaurantId, startDate, endDate],
        }
      );

      return result[0] ?? null;
    },
  }),

  getRevenueProjection: createTool({
    id: "getRevenueProjection",
    description:
      "Project future revenue based on historical trends. Uses 7-day moving averages from Neon PostgreSQL.",
    inputSchema: z.object({
      restaurantId: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      projectionDays: z.number().default(7).describe("Number of days to project forward"),
    }),
    execute: async ({ context, restaurantId, mealType, projectionDays }) => {
      const trends = await context.runAction(
        internal.agents.tools.neonQuery.executeAnalyticsQuery,
        {
          query: `
            WITH daily AS (
              SELECT
                session_date,
                SUM(revenue) as daily_revenue,
                AVG(SUM(revenue)) OVER (
                  ORDER BY session_date
                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                ) as moving_avg_7d
              FROM analytics.session_financials
              WHERE restaurant_id = $1
                AND meal_type = $2
                AND session_date >= CURRENT_DATE - INTERVAL '60 days'
              GROUP BY session_date
              ORDER BY session_date
            )
            SELECT
              session_date,
              daily_revenue,
              ROUND(moving_avg_7d::numeric, 2) as moving_avg_7d
            FROM daily
            ORDER BY session_date DESC
            LIMIT 30
          `,
          params: [restaurantId, mealType],
        }
      );

      if (!trends.length) {
        return { error: "Insufficient historical data for projection" };
      }

      const recentAvg = trends[0].moving_avg_7d;
      const weekAgoAvg = trends.length > 7 ? trends[7].moving_avg_7d : recentAvg;
      const growthRate = weekAgoAvg > 0 ? (recentAvg - weekAgoAvg) / weekAgoAvg : 0;

      const projections = Array.from({ length: projectionDays }, (_, i) => ({
        dayOffset: i + 1,
        projected: Math.round(recentAvg * Math.pow(1 + growthRate / 7, i + 1)),
      }));

      return {
        currentDailyAvg: recentAvg,
        weeklyGrowthRate: `${(growthRate * 100).toFixed(1)}%`,
        projections,
        totalProjected: projections.reduce((sum, p) => sum + p.projected, 0),
      };
    },
  }),

  compareScenarios: createTool({
    id: "compareScenarios",
    description:
      "Compare what-if scenarios. Takes a base case and modified parameters, returns impact analysis.",
    inputSchema: z.object({
      sessionId: z.string(),
      restaurantId: z.string(),
      scenarios: z.array(
        z.object({
          name: z.string().describe("Scenario name, e.g. 'Labor +$5/hr'"),
          changes: z.object({
            laborRateChange: z.number().optional().describe("Dollar change to hourly labor rate"),
            foodCostMultiplier: z.number().optional().describe("Multiplier for food cost (1.1 = +10%)"),
            priceMultiplier: z.number().optional().describe("Multiplier for menu prices"),
            headcountMultiplier: z.number().optional().describe("Multiplier for expected headcount"),
          }),
        })
      ),
    }),
    execute: async ({ context, sessionId, restaurantId, scenarios }) => {
      const [margins, laborRates] = await Promise.all([
        context.runQuery(internal.agents.tools.costTools._getMargins, { sessionId }),
        context.runQuery(internal.agents.tools.costTools._getLaborCosts, { restaurantId }),
      ]);

      const baseRevenue = margins.reduce((s: number, m: any) => s + m.price, 0);
      const baseFoodCost = margins.reduce((s: number, m: any) => s + m.foodCost, 0);
      const baseLaborCost = laborRates.reduce(
        (s: number, r: any) => s + r.hourlyRate * r.hoursPerSession, 0
      );
      const baseProfit = baseRevenue - baseFoodCost - baseLaborCost;

      const results = scenarios.map((scenario) => {
        const c = scenario.changes;
        const newRevenue = baseRevenue * (c.priceMultiplier ?? 1) * (c.headcountMultiplier ?? 1);
        const newFoodCost = baseFoodCost * (c.foodCostMultiplier ?? 1) * (c.headcountMultiplier ?? 1);
        const newLaborCost = baseLaborCost + (c.laborRateChange ?? 0) *
          laborRates.reduce((s: number, r: any) => s + r.hoursPerSession, 0);
        const newProfit = newRevenue - newFoodCost - newLaborCost;

        return {
          name: scenario.name,
          revenue: Math.round(newRevenue),
          foodCost: Math.round(newFoodCost),
          laborCost: Math.round(newLaborCost),
          profit: Math.round(newProfit),
          revenueDelta: Math.round(newRevenue - baseRevenue),
          profitDelta: Math.round(newProfit - baseProfit),
          foodCostPct: newRevenue > 0 ? Math.round((newFoodCost / newRevenue) * 1000) / 10 : 0,
        };
      });

      return {
        baseline: {
          revenue: Math.round(baseRevenue),
          foodCost: Math.round(baseFoodCost),
          laborCost: Math.round(baseLaborCost),
          profit: Math.round(baseProfit),
        },
        scenarios: results,
      };
    },
  }),
};
```

---

## 6. Model Router

The model router maps each capability agent to its optimal AI model. Claude handles reasoning-heavy tasks; Gemini handles multimodal (image/video) tasks.

### Router Configuration

```typescript
// convex/agents/modelRouter.ts
"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

type AgentCapability =
  | "orchestrator"
  | "menuPlanner"
  | "costOptimizer"
  | "demandForecaster"
  | "recipeExpert"
  | "financialAnalyst";

interface ModelConfig {
  model: ReturnType<typeof anthropic> | ReturnType<typeof google>;
  provider: "anthropic" | "google";
  modelId: string;
  reason: string;
}

const MODEL_MAP: Record<AgentCapability, ModelConfig> = {
  orchestrator: {
    model: anthropic("claude-sonnet-4-20250514"),
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    reason: "Fast routing decisions with strong instruction following",
  },

  menuPlanner: {
    model: anthropic("claude-sonnet-4-20250514"),
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    reason: "Strong reasoning for menu composition and constraint satisfaction",
  },

  costOptimizer: {
    model: anthropic("claude-sonnet-4-20250514"),
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    reason: "Precise numerical reasoning for pricing and margin calculations",
  },

  demandForecaster: {
    model: anthropic("claude-sonnet-4-20250514"),
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    reason: "Pattern recognition and statistical reasoning for demand prediction",
  },

  recipeExpert: {
    model: google("gemini-2.5-flash"),
    provider: "google",
    modelId: "gemini-2.5-flash",
    reason: "Multimodal capabilities for food image analysis and recipe generation",
  },

  financialAnalyst: {
    model: anthropic("claude-sonnet-4-20250514"),
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    reason: "Complex financial reasoning, scenario modeling, SQL generation",
  },
};

export function getModelForAgent(capability: AgentCapability): ModelConfig {
  return MODEL_MAP[capability];
}

export function getModelDisplayName(capability: AgentCapability): string {
  const config = MODEL_MAP[capability];
  switch (config.provider) {
    case "anthropic":
      return "Claude 4";
    case "google":
      return "Gemini 2.5";
  }
}

export function isMultimodal(capability: AgentCapability): boolean {
  return MODEL_MAP[capability].provider === "google";
}
```

### Model Selection Logic

| Agent | Model | Provider | Why |
|-------|-------|----------|-----|
| Orchestrator | Claude Sonnet 4 | Anthropic | Fast routing with strong instruction following |
| Menu Planner | Claude Sonnet 4 | Anthropic | Complex constraint satisfaction |
| Cost Optimizer | Claude Sonnet 4 | Anthropic | Precise numerical reasoning |
| Demand Forecaster | Claude Sonnet 4 | Anthropic | Statistical pattern recognition |
| Recipe Expert | Gemini 2.5 Flash | Google | Native image/video understanding |
| Financial Analyst | Claude Sonnet 4 | Anthropic | SQL generation + financial reasoning |

---

## 7. Agent Context Protocol

Every agent invocation receives a structured context string that describes the current session state, workflow step, active rules, and relevant data. This context is built from a `SessionContext` object and injected as the system prompt prefix.

### SessionContext Type

```typescript
// convex/agents/types.ts
import type { Id } from "../_generated/dataModel";

export type AgentName =
  | "orchestrator"
  | "menuPlanner"
  | "costOptimizer"
  | "demandForecaster"
  | "recipeExpert"
  | "financialAnalyst";

export interface SessionContext {
  sessionId: Id<"sessions">;
  restaurantId: Id<"restaurants">;
  restaurantName: string;
  chainName: string | null;
  date: string;                     // ISO date
  mealType: "breakfast" | "lunch" | "dinner";
  currentStep: "ai_rules" | "packaging" | "implementation" | "finances" | "menu";
  headcount: number | null;
  status: "draft" | "in_progress" | "review" | "published";

  aiRules: {
    cuisineTypes: string[];
    maxPrepTimeMinutes: number | null;
    minMarginPercent: number | null;
    maxItemCount: number | null;
    customRules: string[];
  };

  currentItems: Array<{
    id: string;
    dishName: string;
    category: string;
    price: number;
    foodCost: number;
    marginPercent: number;
  }>;

  financialSnapshot: {
    totalRevenue: number;
    totalFoodCost: number;
    totalLaborCost: number;
    primeCostPercent: number;
    netProfit: number;
  } | null;
}
```

### Context Builder

```typescript
// convex/agents/context.ts
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { SessionContext } from "./types";

export const getSessionContext = internalQuery({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { sessionId }): Promise<string> => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const restaurant = await ctx.db.get(session.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");

    const chain = restaurant.chainId
      ? await ctx.db.get(restaurant.chainId)
      : null;

    const sessionItems = await ctx.db
      .query("sessionItems")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const itemsWithDishes = await Promise.all(
      sessionItems.map(async (item) => {
        const dish = await ctx.db.get(item.dishId);
        return {
          id: item._id,
          dishName: dish?.name ?? "Unknown",
          category: dish?.category ?? "Unknown",
          price: item.price,
          foodCost: dish?.foodCost ?? 0,
          marginPercent:
            item.price > 0
              ? ((item.price - (dish?.foodCost ?? 0)) / item.price) * 100
              : 0,
        };
      })
    );

    const sessionContext: SessionContext = {
      sessionId,
      restaurantId: session.restaurantId,
      restaurantName: restaurant.name,
      chainName: chain?.name ?? null,
      date: session.date,
      mealType: session.mealType,
      currentStep: session.currentStep ?? "ai_rules",
      headcount: session.predictedHeadcount ?? null,
      status: session.status ?? "draft",
      aiRules: session.aiRules ?? {
        cuisineTypes: [],
        maxPrepTimeMinutes: null,
        minMarginPercent: null,
        maxItemCount: null,
        customRules: [],
      },
      currentItems: itemsWithDishes,
      financialSnapshot: null,
    };

    return buildSystemContext(sessionContext);
  },
});

export function buildSystemContext(ctx: SessionContext): string {
  const lines: string[] = [
    "=== SESSION CONTEXT ===",
    "",
    `Restaurant: ${ctx.restaurantName}${ctx.chainName ? ` (${ctx.chainName})` : ""}`,
    `Date: ${ctx.date}`,
    `Meal: ${ctx.mealType}`,
    `Step: ${ctx.currentStep}`,
    `Status: ${ctx.status}`,
    `Headcount: ${ctx.headcount ?? "Not set"}`,
    "",
  ];

  // AI Rules
  if (
    ctx.aiRules.cuisineTypes.length > 0 ||
    ctx.aiRules.maxPrepTimeMinutes ||
    ctx.aiRules.minMarginPercent ||
    ctx.aiRules.customRules.length > 0
  ) {
    lines.push("=== ACTIVE RULES ===");
    if (ctx.aiRules.cuisineTypes.length > 0) {
      lines.push(`Cuisine types: ${ctx.aiRules.cuisineTypes.join(", ")}`);
    }
    if (ctx.aiRules.maxPrepTimeMinutes) {
      lines.push(`Max prep time: ${ctx.aiRules.maxPrepTimeMinutes} minutes`);
    }
    if (ctx.aiRules.minMarginPercent) {
      lines.push(`Min margin: ${ctx.aiRules.minMarginPercent}%`);
    }
    if (ctx.aiRules.maxItemCount) {
      lines.push(`Max items: ${ctx.aiRules.maxItemCount}`);
    }
    for (const rule of ctx.aiRules.customRules) {
      lines.push(`Custom: ${rule}`);
    }
    lines.push("");
  }

  // Current Menu Items
  if (ctx.currentItems.length > 0) {
    lines.push("=== CURRENT MENU ITEMS ===");
    lines.push("Name | Category | Price | Food Cost | Margin%");
    lines.push("-----|----------|-------|-----------|-------");
    for (const item of ctx.currentItems) {
      lines.push(
        `${item.dishName} | ${item.category} | $${item.price.toFixed(2)} | $${item.foodCost.toFixed(2)} | ${item.marginPercent.toFixed(1)}%`
      );
    }
    lines.push("");
  }

  // Financial Snapshot
  if (ctx.financialSnapshot) {
    const f = ctx.financialSnapshot;
    lines.push("=== FINANCIAL SNAPSHOT ===");
    lines.push(`Revenue: $${f.totalRevenue.toFixed(2)}`);
    lines.push(`Food Cost: $${f.totalFoodCost.toFixed(2)}`);
    lines.push(`Labor Cost: $${f.totalLaborCost.toFixed(2)}`);
    lines.push(`Prime Cost %: ${f.primeCostPercent.toFixed(1)}%`);
    lines.push(`Net Profit: $${f.netProfit.toFixed(2)}`);
    lines.push("");
  }

  lines.push(
    "=== INSTRUCTIONS ===",
    "- Respect all active rules when making suggestions",
    "- Always quantify impact in dollars when suggesting changes",
    "- Reference specific items by name from the current menu",
    `- The user is currently on the "${ctx.currentStep}" step — focus suggestions accordingly`,
    ""
  );

  return lines.join("\n");
}
```

### Example Context Output

```
=== SESSION CONTEXT ===

Restaurant: Spice Garden (Mumbai Chain)
Date: 2026-03-08
Meal: lunch
Step: packaging
Status: in_progress
Headcount: 120

=== ACTIVE RULES ===
Cuisine types: indian, south_indian
Max prep time: 180 minutes
Min margin: 30%
Custom: Include at least 2 seasonal items

=== CURRENT MENU ITEMS ===
Name | Category | Price | Food Cost | Margin%
-----|----------|-------|-----------|-------
Butter Chicken | main | $14.00 | $4.20 | 70.0%
Masala Dosa | main | $10.00 | $3.50 | 65.0%
Idli Sambar | starter | $6.00 | $1.80 | 70.0%
Mango Lassi | beverage | $5.00 | $1.50 | 70.0%
Gulab Jamun | dessert | $4.00 | $1.20 | 70.0%

=== INSTRUCTIONS ===
- Respect all active rules when making suggestions
- Always quantify impact in dollars when suggesting changes
- Reference specific items by name from the current menu
- The user is currently on the "packaging" step — focus suggestions accordingly
```

---

## 8. Background Agent Crons

Convex scheduled functions run background agents at defined intervals. These agents analyze data and write `proactiveAlerts` that appear in the AI Co-Worker Panel without user prompting.

### Cron Definitions

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// --- Cost Monitoring (every hour) ---
// Checks for ingredient price changes and generates cost alerts
crons.interval(
  "cost-monitoring",
  { hours: 1 },
  internal.agents.background.monitorCosts,
);

// --- Demand Analysis (daily at 6 AM) ---
// Analyzes upcoming sessions and generates demand forecasts
crons.cron(
  "demand-analysis",
  "0 6 * * *",
  internal.agents.background.analyzeDemand,
);

// --- Analytics Sync (every hour) ---
// Syncs published session data to Neon PostgreSQL
crons.interval(
  "analytics-sync",
  { hours: 1 },
  internal.agents.background.syncAnalytics,
);

// --- Menu Optimization (daily at 5 AM) ---
// Scans upcoming draft sessions and suggests menu optimizations
crons.cron(
  "menu-optimization",
  "0 5 * * *",
  internal.agents.background.optimizeMenus,
);

export default crons;
```

### Background Agent Actions

```typescript
// convex/agents/background.ts
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { mastra } from "./setup";

export const monitorCosts = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Fetch all active sessions with upcoming dates
    const activeSessions = await ctx.runQuery(
      internal.sessions.listUpcoming,
      { daysAhead: 3 }
    );

    // 2. Check ingredient price changes since last check
    const priceChanges = await ctx.runQuery(
      internal.ingredients.getRecentPriceChanges,
      { sinceLast: "1h" }
    );

    if (priceChanges.length === 0) return;

    // 3. For each session affected by price changes, generate alerts
    for (const session of activeSessions) {
      const affectedItems = await ctx.runQuery(
        internal.sessions.getItemsAffectedByPriceChanges,
        { sessionId: session._id, ingredientIds: priceChanges.map((p: any) => p._id) }
      );

      if (affectedItems.length === 0) continue;

      // 4. Run cost optimizer agent to analyze impact and suggest actions
      const costAgent = mastra.getAgent("costOptimizer");
      const analysis = await costAgent.generate(
        `Ingredient price changes detected:\n${priceChanges.map((p: any) =>
          `${p.name}: ${p.oldPrice} → ${p.newPrice} (${p.changePercent > 0 ? "+" : ""}${p.changePercent}%)`
        ).join("\n")}\n\nAffected session items:\n${affectedItems.map((i: any) =>
          `${i.dishName}: uses ${i.ingredientName}, current margin ${i.marginPercent}%`
        ).join("\n")}\n\nSuggest substitutions or price adjustments.`
      );

      // 5. Write proactive alerts
      for (const item of affectedItems) {
        await ctx.runMutation(internal.proactiveAlerts.create, {
          sessionId: session._id,
          type: "cost_alert",
          title: `Cost Alert: ${item.ingredientName}`,
          description: analysis.text.slice(0, 500),
          impact: {
            cost: item.costDelta,
            profit: -item.costDelta,
          },
          actions: [
            { label: "Apply", type: "apply", payload: { type: "substitution", itemId: item.id } },
            { label: "Skip", type: "dismiss" },
          ],
          agentSource: "costOptimizer",
        });
      }
    }
  },
});

export const analyzeDemand = internalAction({
  args: {},
  handler: async (ctx) => {
    const upcomingSessions = await ctx.runQuery(
      internal.sessions.listUpcoming,
      { daysAhead: 7 }
    );

    for (const session of upcomingSessions) {
      if (session.predictedHeadcount) continue; // Already has a prediction

      const demandAgent = mastra.getAgent("demandForecaster");
      const prediction = await demandAgent.generate(
        `Predict demand for:\nRestaurant: ${session.restaurantName}\nDate: ${session.date}\nMeal: ${session.mealType}\n\nProvide headcount prediction with confidence range.`
      );

      await ctx.runMutation(internal.proactiveAlerts.create, {
        sessionId: session._id,
        type: "demand_forecast",
        title: `Demand Forecast: ${session.mealType} ${session.date}`,
        description: prediction.text.slice(0, 500),
        impact: {},
        actions: [
          { label: "Apply Forecast", type: "apply", payload: { type: "headcount_update" } },
          { label: "Dismiss", type: "dismiss" },
        ],
        agentSource: "demandForecaster",
      });
    }
  },
});

export const syncAnalytics = internalAction({
  args: {},
  handler: async (ctx) => {
    // Fetch sessions published since last sync
    const publishedSessions = await ctx.runQuery(
      internal.sessions.listRecentlyPublished,
      { sinceLastSync: true }
    );

    for (const session of publishedSessions) {
      const items = await ctx.runQuery(
        internal.sessions.getSessionItemsWithCosts,
        { sessionId: session._id }
      );

      // Upsert into Neon PostgreSQL
      await ctx.runAction(internal.agents.tools.neonQuery.executeAnalyticsQuery, {
        query: `
          INSERT INTO analytics.session_financials
            (session_id, restaurant_id, session_date, meal_type,
             revenue, food_cost, labor_cost, other_costs, headcount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (session_id) DO UPDATE SET
            revenue = EXCLUDED.revenue,
            food_cost = EXCLUDED.food_cost,
            labor_cost = EXCLUDED.labor_cost,
            other_costs = EXCLUDED.other_costs,
            headcount = EXCLUDED.headcount,
            updated_at = NOW()
        `,
        params: [
          session._id,
          session.restaurantId,
          session.date,
          session.mealType,
          session.totalRevenue,
          session.totalFoodCost,
          session.totalLaborCost,
          session.otherCosts ?? 0,
          session.actualHeadcount ?? session.predictedHeadcount ?? 0,
        ],
      });

      // Mark session as synced
      await ctx.runMutation(internal.sessions.markSynced, {
        sessionId: session._id,
      });
    }
  },
});

export const optimizeMenus = internalAction({
  args: {},
  handler: async (ctx) => {
    const draftSessions = await ctx.runQuery(
      internal.sessions.listDrafts,
      { daysAhead: 3 }
    );

    for (const session of draftSessions) {
      if (!session.items?.length) continue;

      const menuAgent = mastra.getAgent("menuPlanner");
      const analysis = await menuAgent.generate(
        `Review this menu for optimization opportunities:\n${session.items.map((i: any) =>
          `${i.dishName} | $${i.price} | margin: ${i.marginPercent}% | category: ${i.category}`
        ).join("\n")}\n\nLook for: low-margin items that could be swapped, missing categories, seasonal opportunities.`
      );

      await ctx.runMutation(internal.proactiveAlerts.create, {
        sessionId: session._id,
        type: "menu_optimization",
        title: "Optimize Menu",
        description: analysis.text.slice(0, 500),
        impact: {
          revenue: 0,
          profit: 0,
        },
        actions: [
          { label: "Apply", type: "apply", payload: { type: "menu_swap" } },
          { label: "Dismiss", type: "dismiss" },
        ],
        agentSource: "menuPlanner",
      });
    }
  },
});
```

### Cron Schedule Summary

| Cron | Frequency | Agent | Output |
|------|-----------|-------|--------|
| Cost Monitoring | Every hour | Cost Optimizer | Cost alerts on ingredient price changes |
| Demand Analysis | Daily 6 AM | Demand Forecaster | Headcount predictions for upcoming sessions |
| Analytics Sync | Every hour | N/A (data pipeline) | Published sessions → Neon PostgreSQL |
| Menu Optimization | Daily 5 AM | Menu Planner | Menu swap suggestions for draft sessions |

---

## 9. File Structure

```
convex/agents/
├── setup.ts                          # Mastra instance + model config ("use node")
├── run.ts                            # runAgent / streamAgent actions ("use node")
├── orchestrator.ts                   # Orchestrator runner action ("use node")
├── modelRouter.ts                    # Capability → model mapping ("use node")
├── context.ts                        # getSessionContext + buildSystemContext
├── types.ts                          # AgentName, SessionContext, RoutingDecision
├── background.ts                     # Background agent actions ("use node")
│
├── agents/                           # Agent definitions (Mastra Agent instances)
│   ├── orchestrator.ts               # Orchestrator agent ("use node")
│   ├── menuPlanner.ts                # Menu Planner agent ("use node")
│   ├── costOptimizer.ts              # Cost Optimizer agent ("use node")
│   ├── demandForecaster.ts           # Demand Forecaster agent ("use node")
│   ├── recipeExpert.ts               # Recipe Expert agent ("use node")
│   └── financialAnalyst.ts           # Financial Analyst agent ("use node")
│
├── tools/                            # Agent tools (Convex internal functions)
│   ├── menuTools.ts                  # Menu templates, dish catalog, seasonal items
│   ├── costTools.ts                  # Ingredient prices, margins, prime cost
│   ├── demandTools.ts                # Historical demand, headcount prediction
│   ├── recipeTools.ts                # Image analysis, recipe generation
│   ├── financeTools.ts               # P&L, projections, scenarios (Neon SQL)
│   └── neonQuery.ts                  # Neon PostgreSQL query executor ("use node")
│
├── messages.ts                       # Thread message CRUD
└── threads.ts                        # Thread lifecycle

convex/
├── crons.ts                          # Scheduled function definitions
├── pendingChanges.ts                 # PendingChange mutations (from 04-AI-COPANEL)
└── proactiveAlerts.ts                # ProactiveAlert mutations
```

### Module Dependency Graph

```
                  ┌─────────────────┐
                  │   crons.ts      │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  background.ts  │ ──── runs agents on schedule
                  └────────┬────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌───────────────┐
    │  setup.ts │  │  run.ts   │  │orchestrator.ts│
    │  (Mastra) │──│ (execute) │──│  (routing)    │
    └─────┬─────┘  └───────────┘  └───────┬───────┘
          │                               │
          ▼                               ▼
    ┌─────────────────────────────────────────────┐
    │              agents/                         │
    │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │menuPlan. │ │costOpt.  │ │demandForec.  │ │
    │  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
    │  ┌────┴─────┐ ┌────┴─────┐ ┌──────┴───────┐ │
    │  │recipeExp.│ │finAnaly. │ │              │ │
    │  └────┬─────┘ └────┬─────┘ └──────────────┘ │
    └───────┼────────────┼────────────────────────┘
            │            │
            ▼            ▼
    ┌─────────────────────────────────────────────┐
    │              tools/                          │
    │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │menuTools │ │costTools │ │demandTools   │ │
    │  └──────────┘ └──────────┘ └──────────────┘ │
    │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
    │  │recTools  │ │finTools  │ │neonQuery     │ │
    │  └──────────┘ └──────────┘ └──────────────┘ │
    └──────────────────┬──────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
    ┌───────────────┐     ┌──────────────┐
    │  Convex DB    │     │  Neon PG     │
    │  (reactive)   │     │  (analytics) │
    └───────────────┘     └──────────────┘
```

---

*Previous: [04-AI-COPANEL.md](./04-AI-COPANEL.md) -- AI Co-Worker Panel*
*Next: [06-DATA-LAYER.md](./06-DATA-LAYER.md) -- Convex schema and Neon analytics*
