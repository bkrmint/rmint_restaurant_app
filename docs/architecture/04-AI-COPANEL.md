# AI Co-Worker Panel

**Version:** 1.0
**Date:** March 8, 2026
**Status:** Architecture Design
**Parent:** [00-OVERVIEW.md](./00-OVERVIEW.md)
**Depends On:** [01-THREE-PANEL-LAYOUT.md](./01-THREE-PANEL-LAYOUT.md), [03-WORKSPACE-PANEL.md](./03-WORKSPACE-PANEL.md)

---

## Table of Contents

1. [What Is the AI Co-Worker Panel](#1-what-is-the-ai-co-worker-panel)
2. [Panel Sections](#2-panel-sections)
3. [Streaming via Convex Agent Component](#3-streaming-via-convex-agent-component)
4. [Thread Management](#4-thread-management)
5. [Proactive Card Component](#5-proactive-card-component)
6. [Suggestion Chips](#6-suggestion-chips)
7. [Apply Workflow](#7-apply-workflow)
8. [Voice Input](#8-voice-input)
9. [File Structure](#9-file-structure)

---

## 1. What Is the AI Co-Worker Panel

The AI Co-Worker Panel is the persistent right sidebar of the RMINT Restaurant Co-Work app. It combines **chat**, **proactive intelligence**, and an **approval workflow** into a single surface — the "Claude Co-Work" / "Gemini Studio" aspect of the application.

Unlike a standard chatbot panel, the AI Co-Worker is **proactive**: it pushes suggestions, cost alerts, and optimization cards *before* the user asks. It knows which workflow step the operator is on, what rules they've set, and what the current session data looks like. Every actionable suggestion includes an **Apply** button that creates a `PendingChange` in Convex, which the Workspace panel renders as an overlay for approval.

### Panel Layout

```
+-----------------------------------------------+
|  ┌─────────────────────────────────────────┐   |
|  │  RMINT AI          Claude 4 │ Lunch 3/8 │   |  ← Header
|  └─────────────────────────────────────────┘   |
|                                                 |
|  ┌─ Proactive Cards ──────────────────────┐    |
|  │ ┌─────────────────────────────────────┐ │   |
|  │ │ 🟢 Optimize Menu                    │ │   |
|  │ │ +$450 Revenue  +$190 Profit         │ │   |
|  │ │                          [Apply]    │ │   |
|  │ └─────────────────────────────────────┘ │   |
|  │ ┌─────────────────────────────────────┐ │   |
|  │ │ 🟢 Price tea at $15.00             │ │   |
|  │ │ +$80 Revenue   +$24 Profit          │ │   |
|  │ │                          [Apply]    │ │   |
|  │ └─────────────────────────────────────┘ │   |
|  │ ┌─────────────────────────────────────┐ │   |
|  │ │ 🔴 Cost Alert                       │ │   |
|  │ │ Potato prices ↓12%                  │ │   |
|  │ │ Replace Dosa → Masala Dosa          │ │   |
|  │ │ +$134 Revenue  +$40 Profit          │ │   |
|  │ │ [Masala Dosa] [Aloo Paratha] [Skip] │ │   |
|  │ └─────────────────────────────────────┘ │   |
|  └─────────────────────────────────────────┘   |
|                                                 |
|  ┌─ Chat History (scrollable) ────────────┐    |
|  │                                         │   |
|  │        ┌──────────────────────┐         │   |
|  │        │ Can you suggest a    │ ←──── User│  |
|  │        │ low-cost breakfast?  │  (coral) │  |
|  │        └──────────────────────┘         │   |
|  │ ┌──────────────────────────┐            │   |
|  │ │ Based on current costs,  │ ←──── AI   │   |
|  │ │ I recommend Idli-Vada    │  (white)   │   |
|  │ │ combo at $8.50.          │            │   |
|  │ │                  [Apply] │            │   |
|  │ └──────────────────────────┘            │   |
|  │ ┌──────────────────────────┐            │   |
|  │ │ Sure, I'll only suggest  │ ←──── AI   │   |
|  │ │ items with margin > 30%  │  (rule)    │   |
|  │ │                  [Apply] │            │   |
|  │ └──────────────────────────┘            │   |
|  └─────────────────────────────────────────┘   |
|                                                 |
|  ┌─ Suggestion Chips ─────────────────────┐    |
|  │ [Prep time < 3hrs] [Seasonal items]    │    |
|  │ [Price changes] [40%+ margin]          │    |
|  └─────────────────────────────────────────┘   |
|                                                 |
|  ┌─ Input ────────────────────────────────┐    |
|  │ │ Ask RMINT AI...              🎤  ➤ │    |
|  └─────────────────────────────────────────┘   |
+-----------------------------------------------+
            320-380px fixed width
```

### Key Characteristics

| Characteristic | Detail |
|----------------|--------|
| **Width** | 320–380px fixed, collapsible |
| **Streaming** | Convex DB-delta (not SSE/WebSocket) |
| **Thread model** | One thread per meal session |
| **Proactive** | Background agents push cards without user prompt |
| **Approval** | Every actionable suggestion has an Apply button |
| **Context-aware** | Suggestion chips change per workflow step |
| **Multimodal** | Accepts text, voice, and images (via Gemini) |

---

## 2. Panel Sections

The panel is a vertical flex column divided into five sections from top to bottom.

### 2.1 Header

The header is a compact bar showing three pieces of context at a glance.

```typescript
// src/features/ai-panel/components/AIPanelHeader.tsx
import { Badge } from "@/components/ui/badge";

interface AIPanelHeaderProps {
  modelName: string;      // "Claude 4" | "Gemini 2.5"
  sessionLabel: string;   // "Lunch · Mar 8"
  isStreaming: boolean;
}

export function AIPanelHeader({
  modelName,
  sessionLabel,
  isStreaming,
}: AIPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight">RMINT AI</span>
        {isStreaming && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs font-mono">
          {modelName}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {sessionLabel}
        </Badge>
      </div>
    </div>
  );
}
```

| Element | Render |
|---------|--------|
| **Title** | "RMINT AI" in semibold, left-aligned |
| **Streaming dot** | Green pulsing dot when AI is generating |
| **Model badge** | Outline badge: "Claude 4" or "Gemini 2.5" |
| **Session badge** | Secondary badge: "Lunch · Mar 8" derived from current session |

### 2.2 Proactive Cards

Proactive cards are agent-initiated suggestions that appear **without the user asking**. Background agents (Convex crons) analyze costs, demand, and menu composition, writing `proactiveAlerts` to Convex. The panel subscribes reactively.

Three card types exist:

#### Optimize Menu Card (green border)

```
┌────────────────────────────────────────┐
│  Optimize Menu                         │
│                                        │
│  Swap 3 items for better margins and   │
│  seasonal alignment.                   │
│                                        │
│  ┌──────────────┐  ┌──────────────┐   │
│  │ +$450 Revenue│  │ +$190 Profit │   │
│  └──────────────┘  └──────────────┘   │
│                                        │
│                         [Apply]  [✕]   │
└────────────────────────────────────────┘
  border-left: 4px solid green-500
```

#### Price Suggestion Card (green border)

```
┌────────────────────────────────────────┐
│  Price tea at $15.00                   │
│                                        │
│  Current price: $12.00. Demand is      │
│  inelastic at this price point.        │
│                                        │
│  ┌─────────────┐  ┌─────────────┐     │
│  │ +$80 Revenue│  │ +$24 Profit │     │
│  └─────────────┘  └─────────────┘     │
│                                        │
│                         [Apply]  [✕]   │
└────────────────────────────────────────┘
  border-left: 4px solid green-500
```

#### Cost Alert Card (red border)

```
┌────────────────────────────────────────┐
│  ⚠ Cost Alert                          │
│                                        │
│  Potato prices down 12%. Replace Dosa  │
│  with Masala Dosa for better margins.  │
│                                        │
│  ┌──────────────┐  ┌─────────────┐    │
│  │ +$134 Revenue│  │ +$40 Profit │    │
│  └──────────────┘  └─────────────┘    │
│                                        │
│  [Masala Dosa] [Aloo Paratha] [Skip]   │
└────────────────────────────────────────┘
  border-left: 4px solid red-500
```

The full `ProactiveCard` component is detailed in [Section 5](#5-proactive-card-component).

### 2.3 Chat History

The scrollable message list renders three message types:

| Type | Alignment | Background | Has Apply? |
|------|-----------|------------|------------|
| User message | Right | `bg-coral-100` (salmon/coral) | No |
| AI response (informational) | Left | `bg-white` card | No |
| AI response (actionable) | Left | `bg-white` card | Yes |
| Rule confirmation | Left | `bg-blue-50` card | Yes |

```typescript
// src/features/ai-panel/components/ChatMessage.tsx
import { cn } from "@/lib/utils";
import { ApplyButton } from "./ApplyButton";
import { SmoothText } from "./SmoothText";
import type { UIMessage } from "@/features/ai-panel/types";

interface ChatMessageProps {
  message: UIMessage;
  isStreaming: boolean;
  sessionId: string;
}

export function ChatMessage({ message, isStreaming, sessionId }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isActionable = message.metadata?.actionable === true;
  const isRule = message.metadata?.type === "rule_confirmation";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser && "bg-coral-100 text-coral-900",
          !isUser && !isRule && "bg-white shadow-sm border",
          isRule && "bg-blue-50 border border-blue-200"
        )}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <SmoothText
            content={message.content}
            isStreaming={isStreaming && message.isLastMessage}
          />
        )}

        {!isUser && (isActionable || isRule) && message.metadata?.pendingAction && (
          <div className="mt-3 flex justify-end">
            <ApplyButton
              action={message.metadata.pendingAction}
              sessionId={sessionId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2.4 Suggestion Chips

Context-aware quick-action pills rendered at the bottom of the chat history, above the input. They change based on the current workflow step.

```typescript
// src/features/ai-panel/components/SuggestionChips.tsx
import { STEP_SUGGESTIONS } from "@/features/ai-panel/constants";
import type { WorkflowStep } from "@/types";

interface SuggestionChipsProps {
  currentStep: WorkflowStep;
  onSelect: (suggestion: string) => void;
  disabled: boolean;
}

export function SuggestionChips({
  currentStep,
  onSelect,
  disabled,
}: SuggestionChipsProps) {
  const suggestions = STEP_SUGGESTIONS[currentStep];

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t bg-gray-50/50">
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          disabled={disabled}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium",
            "bg-white text-gray-700 hover:bg-gray-100 hover:border-gray-400",
            "transition-colors disabled:opacity-50"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
```

The full mapping is defined in [Section 6](#6-suggestion-chips).

### 2.5 Chat Input

The input bar at the very bottom of the panel includes a text field, a send button, and a microphone button.

```typescript
// src/features/ai-panel/components/ChatInput.tsx
import { useState, useRef, type KeyboardEvent } from "react";
import { Send, Mic } from "lucide-react";
import { useVoiceInput } from "@/features/ai-panel/hooks/useVoiceInput";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { isListening, startListening, stopListening } = useVoiceInput({
    onTranscript: (transcript) => setText((prev) => prev + transcript),
  });

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t px-4 py-3">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask RMINT AI..."
        rows={1}
        className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={disabled}
      />
      <button
        onClick={isListening ? stopListening : startListening}
        className={cn(
          "rounded-full p-2 transition-colors",
          isListening
            ? "bg-red-100 text-red-600"
            : "text-gray-400 hover:text-gray-600"
        )}
        aria-label={isListening ? "Stop recording" : "Start voice input"}
      >
        <Mic className="h-4 w-4" />
      </button>
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="rounded-full bg-blue-600 p-2 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
```

---

## 3. Streaming via Convex Agent Component

The AI Co-Worker uses `@convex-dev/agents` for thread and message management. Streaming works via **Convex DB-delta protocol** — the agent writes tokens to the Convex database as they arrive, and `useQuery` subscriptions push deltas to the client in real time. No SSE endpoints, no WebSocket setup, no manual reconnection logic.

### How DB-Delta Streaming Works

```
Agent generates token "The"
  → Agent writes to Convex message doc: content = "The"
  → Convex detects document change
  → All useQuery subscribers receive delta
  → React re-renders with "The"

Agent generates token " best"
  → Agent updates message doc: content = "The best"
  → Convex pushes delta to subscribers
  → React re-renders with "The best"

... continues until generation completes
```

### Agent Chat Action

```typescript
// convex/agents/chat.ts
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export const sendMessage = action({
  args: {
    threadId: v.id("agent_threads"),
    content: v.string(),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { threadId, content, sessionId }) => {
    // 1. Write the user message to the thread
    const userMessageId = await ctx.runMutation(
      internal.agents.messages.create,
      {
        threadId,
        role: "user",
        content,
      }
    );

    // 2. Build session context for the agent
    const sessionContext = await ctx.runQuery(
      internal.agents.context.getSessionContext,
      { sessionId }
    );

    // 3. Create a placeholder AI message (for streaming)
    const aiMessageId = await ctx.runMutation(
      internal.agents.messages.create,
      {
        threadId,
        role: "assistant",
        content: "",
        metadata: { status: "streaming" },
      }
    );

    // 4. Route to the orchestrator agent
    const response = await ctx.runAction(
      internal.agents.orchestrator.run,
      {
        threadId,
        messageId: aiMessageId,
        userMessage: content,
        sessionContext,
      }
    );

    // 5. Finalize the message with full content + metadata
    await ctx.runMutation(internal.agents.messages.update, {
      messageId: aiMessageId,
      content: response.content,
      metadata: {
        status: "complete",
        model: response.model,
        agentUsed: response.agentUsed,
        actionable: response.actionable,
        pendingAction: response.pendingAction ?? null,
      },
    });

    return aiMessageId;
  },
});
```

### Client-Side Streaming Hook

```typescript
// src/features/ai-panel/hooks/useAIChat.ts
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function useAIChat(threadId: Id<"agent_threads"> | null) {
  // Reactive query — auto-updates on every DB delta
  const messages = useQuery(
    api.agents.messages.listByThread,
    threadId ? { threadId } : "skip"
  );

  const sendMessage = useAction(api.agents.chat.sendMessage);

  const isStreaming = messages?.some(
    (m) => m.metadata?.status === "streaming"
  ) ?? false;

  return {
    messages: messages ?? [],
    isStreaming,
    sendMessage,
  };
}
```

### useUIMessages with Streaming Support

```typescript
// src/features/ai-panel/hooks/useUIMessages.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { UIMessage } from "@/features/ai-panel/types";

interface UseUIMessagesOptions {
  stream?: boolean;
}

export function useUIMessages(
  threadId: Id<"agent_threads"> | null,
  options: UseUIMessagesOptions = {}
): { messages: UIMessage[]; isStreaming: boolean } {
  const { stream = true } = options;

  const rawMessages = useQuery(
    api.agents.messages.listByThread,
    threadId ? { threadId, includeStreaming: stream } : "skip"
  );

  const isStreaming = rawMessages?.some(
    (m) => m.metadata?.status === "streaming"
  ) ?? false;

  const messages = useMemo<UIMessage[]>(() => {
    if (!rawMessages) return [];
    return rawMessages.map((m, i) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      createdAt: m._creationTime,
      isLastMessage: i === rawMessages.length - 1,
      metadata: m.metadata ?? null,
    }));
  }, [rawMessages]);

  return { messages, isStreaming };
}
```

### SmoothText Component

SmoothText renders AI text with a smooth token-by-token animation. It buffers incoming content changes and reveals characters at a configurable speed to avoid jarring text jumps.

```typescript
// src/features/ai-panel/components/SmoothText.tsx
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

interface SmoothTextProps {
  content: string;
  isStreaming: boolean;
  charDelay?: number; // ms per character, default 12
}

export function SmoothText({
  content,
  isStreaming,
  charDelay = 12,
}: SmoothTextProps) {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(content);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  targetRef.current = content;

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(content);
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setDisplayed((prev) => {
        const target = targetRef.current;
        if (prev.length >= target.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          return target;
        }
        // Reveal 1-3 characters per tick for natural pacing
        const charsToAdd = Math.min(3, target.length - prev.length);
        return target.slice(0, prev.length + charsToAdd);
      });
    }, charDelay);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStreaming, content, charDelay]);

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{displayed}</ReactMarkdown>
      {isStreaming && displayed.length < content.length && (
        <span className="inline-block h-4 w-1 animate-pulse bg-gray-400 ml-0.5" />
      )}
    </div>
  );
}
```

---

## 4. Thread Management

Each meal session maps to exactly **one agent thread**. When a user opens a session for the first time, a thread is created and its ID is stored on the session document. Subsequent visits reuse the same thread, giving the AI full conversational history for that session.

### Thread Lifecycle

```
Session Created (user selects date + meal)
  └─ No thread exists yet
     └─ User opens AI panel or AI sends first proactive card
        └─ getOrCreateThread mutation fires
           └─ Creates thread in agent_threads table
              └─ Stores threadId on the session document
                 └─ All future messages use this threadId

Session Reopened
  └─ Thread already exists on session document
     └─ Load existing thread → show full chat history
```

### Convex Thread Mutations

```typescript
// convex/agents/threads.ts
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const getOrCreateThread = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    // Return existing thread if present
    if (session.threadId) {
      return session.threadId;
    }

    // Create a new thread
    const threadId = await ctx.db.insert("agent_threads", {
      sessionId,
      createdAt: Date.now(),
      metadata: {
        restaurantId: session.restaurantId,
        mealType: session.mealType,
        date: session.date,
      },
    });

    // Link thread back to session
    await ctx.db.patch(sessionId, { threadId });

    return threadId;
  },
});

export const getThreadBySession = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session?.threadId) return null;
    return ctx.db.get(session.threadId);
  },
});

export const archiveThread = internalMutation({
  args: {
    threadId: v.id("agent_threads"),
  },
  handler: async (ctx, { threadId }) => {
    await ctx.db.patch(threadId, {
      archivedAt: Date.now(),
    });
  },
});
```

### Client-Side Thread Hook

```typescript
// src/features/ai-panel/hooks/useThread.ts
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export function useThread(sessionId: Id<"sessions"> | null) {
  const thread = useQuery(
    api.agents.threads.getThreadBySession,
    sessionId ? { sessionId } : "skip"
  );

  const getOrCreateThread = useMutation(api.agents.threads.getOrCreateThread);

  useEffect(() => {
    if (sessionId && thread === null) {
      getOrCreateThread({ sessionId });
    }
  }, [sessionId, thread, getOrCreateThread]);

  return {
    threadId: thread?._id ?? null,
    isLoading: thread === undefined,
  };
}
```

---

## 5. Proactive Card Component

Proactive cards are rendered from `proactiveAlerts` documents written by background agents. Each alert has a type, impact metrics, and one or more actions.

### Alert Schema (Convex)

```typescript
// convex/schema.ts (proactiveAlerts table excerpt)
proactiveAlerts: defineTable({
  sessionId: v.id("sessions"),
  type: v.union(
    v.literal("menu_optimization"),
    v.literal("price_suggestion"),
    v.literal("cost_alert"),
    v.literal("demand_forecast"),
    v.literal("recipe_suggestion")
  ),
  title: v.string(),
  description: v.string(),
  impact: v.object({
    revenue: v.optional(v.number()),   // delta in dollars
    profit: v.optional(v.number()),    // delta in dollars
    cost: v.optional(v.number()),      // delta in dollars (negative = savings)
  }),
  actions: v.array(v.object({
    label: v.string(),
    type: v.union(v.literal("apply"), v.literal("alternative"), v.literal("dismiss")),
    payload: v.optional(v.any()),
  })),
  status: v.union(
    v.literal("active"),
    v.literal("applied"),
    v.literal("dismissed")
  ),
  createdAt: v.number(),
  agentSource: v.string(),
})
  .index("by_session_status", ["sessionId", "status"])
  .index("by_session_created", ["sessionId", "createdAt"]),
```

### ProactiveCard Component

```typescript
// src/features/ai-panel/components/ProactiveCard.tsx
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImpactBadge } from "./ImpactBadge";
import type { Id } from "@/convex/_generated/dataModel";

type AlertType =
  | "menu_optimization"
  | "price_suggestion"
  | "cost_alert"
  | "demand_forecast"
  | "recipe_suggestion";

interface ProactiveAlert {
  _id: Id<"proactiveAlerts">;
  sessionId: Id<"sessions">;
  type: AlertType;
  title: string;
  description: string;
  impact: {
    revenue?: number;
    profit?: number;
    cost?: number;
  };
  actions: Array<{
    label: string;
    type: "apply" | "alternative" | "dismiss";
    payload?: unknown;
  }>;
}

const BORDER_COLORS: Record<AlertType, string> = {
  menu_optimization: "border-l-green-500",
  price_suggestion: "border-l-green-500",
  cost_alert: "border-l-red-500",
  demand_forecast: "border-l-blue-500",
  recipe_suggestion: "border-l-amber-500",
};

const TYPE_ICONS: Record<AlertType, string> = {
  menu_optimization: "📊",
  price_suggestion: "💰",
  cost_alert: "⚠️",
  demand_forecast: "📈",
  recipe_suggestion: "🍳",
};

export function ProactiveCard({ alert }: { alert: ProactiveAlert }) {
  const createPendingChange = useMutation(api.pendingChanges.create);
  const dismissAlert = useMutation(api.proactiveAlerts.dismiss);

  async function handleAction(action: ProactiveAlert["actions"][number]) {
    if (action.type === "dismiss") {
      await dismissAlert({ alertId: alert._id });
      return;
    }

    // "apply" and "alternative" both create a PendingChange
    await createPendingChange({
      sessionId: alert.sessionId,
      source: "proactive_alert",
      sourceId: alert._id,
      changeType: mapAlertTypeToChangeType(alert.type),
      description: `${alert.title}: ${action.label}`,
      payload: action.payload ?? null,
      impact: alert.impact,
    });
  }

  async function handleDismiss() {
    await dismissAlert({ alertId: alert._id });
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-l-4 bg-white p-4 shadow-sm",
        BORDER_COLORS[alert.type]
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{TYPE_ICONS[alert.type]}</span>
          <h4 className="text-sm font-semibold text-gray-900">
            {alert.title}
          </h4>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
        {alert.description}
      </p>

      {/* Impact Badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.impact.revenue != null && (
          <ImpactBadge
            label="Revenue"
            value={alert.impact.revenue}
            type="revenue"
          />
        )}
        {alert.impact.profit != null && (
          <ImpactBadge
            label="Profit"
            value={alert.impact.profit}
            type="profit"
          />
        )}
        {alert.impact.cost != null && (
          <ImpactBadge
            label="Cost"
            value={alert.impact.cost}
            type="cost"
          />
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.actions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleAction(action)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              action.type === "apply" &&
                "bg-blue-600 text-white hover:bg-blue-700",
              action.type === "alternative" &&
                "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
              action.type === "dismiss" &&
                "text-gray-500 hover:text-gray-700"
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function mapAlertTypeToChangeType(
  alertType: AlertType
): "menu_swap" | "price_change" | "ingredient_substitution" | "recipe_update" {
  switch (alertType) {
    case "menu_optimization":
      return "menu_swap";
    case "price_suggestion":
      return "price_change";
    case "cost_alert":
      return "ingredient_substitution";
    case "recipe_suggestion":
      return "recipe_update";
    case "demand_forecast":
      return "price_change";
  }
}
```

### ImpactBadge Sub-Component

```typescript
// src/features/ai-panel/components/ImpactBadge.tsx
import { cn } from "@/lib/utils";

interface ImpactBadgeProps {
  label: string;
  value: number;   // dollar amount (positive = good, negative = bad)
  type: "revenue" | "profit" | "cost";
}

export function ImpactBadge({ label, value, type }: ImpactBadgeProps) {
  const isPositive = type === "cost" ? value < 0 : value > 0;
  const prefix = value > 0 ? "+" : "";
  const formatted = `${prefix}$${Math.abs(value).toLocaleString()}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isPositive && "bg-green-100 text-green-800",
        !isPositive && "bg-red-100 text-red-800"
      )}
    >
      {formatted} {label}
    </span>
  );
}
```

### ProactiveCards Container

```typescript
// src/features/ai-panel/components/ProactiveCardsSection.tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ProactiveCard } from "./ProactiveCard";
import type { Id } from "@/convex/_generated/dataModel";

interface ProactiveCardsSectionProps {
  sessionId: Id<"sessions">;
}

export function ProactiveCardsSection({ sessionId }: ProactiveCardsSectionProps) {
  const alerts = useQuery(api.proactiveAlerts.listActive, { sessionId });

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-3 border-b px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Suggestions
      </h3>
      {alerts.map((alert) => (
        <ProactiveCard key={alert._id} alert={alert} />
      ))}
    </div>
  );
}
```

---

## 6. Suggestion Chips

Suggestion chips are pre-written prompts that change based on the current workflow step. Clicking a chip sends its text to the AI as a user message.

### Full Mapping

```typescript
// src/features/ai-panel/constants.ts
import type { WorkflowStep } from "@/types";

export const STEP_SUGGESTIONS: Record<WorkflowStep, string[]> = {
  ai_rules: [
    "Preparation time below 3hrs",
    "Include at least 2 seasonal items",
    "Take advantage of raw material price changes",
    "Popular party menu items only",
    "Items with more than 40% profit margin",
  ],

  packaging: [
    "Optimize for headcount",
    "Reduce food waste",
    "Seasonal specials",
  ],

  implementation: [
    "Suggest recipe alternatives",
    "Optimize plating",
    "Check sourcing",
  ],

  finances: [
    "What if labor +$5/hr",
    "Optimize cost of goods",
    "Increase profits 10%",
  ],

  menu: [
    "Final quality check",
    "Compare to last week",
  ],
};
```

### How Chips Render Per Step

| Step | Chips Shown | Purpose |
|------|-------------|---------|
| **AI Rules** | Preparation time, seasonal items, price changes, party items, profit margin | Help user define constraints quickly |
| **Packaging** | Headcount optimization, waste reduction, seasonal specials | Quantity and composition suggestions |
| **Implementation** | Recipe alternatives, plating, sourcing | Practical execution help |
| **Finances** | Labor what-if, COGS optimization, profit targets | Financial scenario exploration |
| **Menu** | Quality check, week comparison | Final review actions |

### Chip Selection Flow

```
User is on "finances" step
  → Panel renders: [What if labor +$5/hr] [Optimize cost of goods] [Increase profits 10%]
  → User clicks [What if labor +$5/hr]
  → Text "What if labor +$5/hr" is sent to sendMessage action
  → Orchestrator routes to Financial Analyst agent
  → Agent runs scenario analysis, returns projected impact
  → Response appears in chat with impact numbers
```

---

## 7. Apply Workflow

The Apply workflow is the critical bridge between AI suggestions and actual workspace modifications. It ensures every AI-proposed change passes through an explicit user approval step.

### Flow Diagram

```
                    AI Co-Worker Panel                          Workspace Panel
                    ──────────────────                          ───────────────

1. AI suggests     ┌──────────────────┐
   price change    │ Price tea $15.00 │
                   │ +$80  +$24       │
                   │         [Apply]  │
                   └──────────────────┘
                            │
2. User clicks              │
   [Apply]                  ▼
                   ┌──────────────────┐
                   │ Convex mutation:  │
                   │ pendingChanges    │
                   │   .create(...)    │
                   └──────────────────┘
                            │
                            │  Convex reactive query pushes update
                            ▼
3. Workspace               ┌──────────────────────────────┐
   shows overlay           │  Tea            │ $12.00      │
                           │  ┌─────────────────────────┐  │
                           │  │ ▲ Proposed: $15.00      │  │
                           │  │   +$80 Rev  +$24 Prof   │  │
                           │  │  [Approve]  [Reject]    │  │
                           │  └─────────────────────────┘  │
                           └──────────────────────────────┘
                            │
4. User clicks              │
   [Approve]                ▼
                   ┌──────────────────────┐
                   │ Convex mutation:      │
                   │ pendingChanges        │
                   │   .approve(changeId)  │
                   │                       │
                   │ - Applies the change  │
                   │ - Updates session item│
                   │ - Marks PendingChange │
                   │   as "approved"       │
                   └──────────────────────┘
                            │
5. Workspace auto-          │  Convex reactive query
   updates via reactive     ▼  re-renders affected row
                   ┌──────────────────────────────┐
                   │  Tea            │ $15.00      │
                   │                 │ ↑ +25%      │
                   └──────────────────────────────┘
```

### PendingChange Schema

```typescript
// convex/schema.ts (pendingChanges table excerpt)
pendingChanges: defineTable({
  sessionId: v.id("sessions"),
  source: v.union(
    v.literal("proactive_alert"),
    v.literal("chat_suggestion"),
    v.literal("rule_application")
  ),
  sourceId: v.optional(v.string()),
  changeType: v.union(
    v.literal("price_change"),
    v.literal("menu_swap"),
    v.literal("ingredient_substitution"),
    v.literal("recipe_update"),
    v.literal("quantity_adjustment"),
    v.literal("rule_update")
  ),
  description: v.string(),
  payload: v.any(),     // type-specific change data
  impact: v.object({
    revenue: v.optional(v.number()),
    profit: v.optional(v.number()),
    cost: v.optional(v.number()),
  }),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("expired")
  ),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.string()),
})
  .index("by_session_status", ["sessionId", "status"])
  .index("by_session_created", ["sessionId", "createdAt"]),
```

### PendingChange Mutations

```typescript
// convex/pendingChanges.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    source: v.union(
      v.literal("proactive_alert"),
      v.literal("chat_suggestion"),
      v.literal("rule_application")
    ),
    sourceId: v.optional(v.string()),
    changeType: v.union(
      v.literal("price_change"),
      v.literal("menu_swap"),
      v.literal("ingredient_substitution"),
      v.literal("recipe_update"),
      v.literal("quantity_adjustment"),
      v.literal("rule_update")
    ),
    description: v.string(),
    payload: v.any(),
    impact: v.object({
      revenue: v.optional(v.number()),
      profit: v.optional(v.number()),
      cost: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("pendingChanges", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const listBySession = query({
  args: {
    sessionId: v.id("sessions"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected")
      )
    ),
  },
  handler: async (ctx, { sessionId, status }) => {
    let q = ctx.db
      .query("pendingChanges")
      .withIndex("by_session_status", (q) =>
        status
          ? q.eq("sessionId", sessionId).eq("status", status)
          : q.eq("sessionId", sessionId)
      );
    return q.collect();
  },
});

export const approve = mutation({
  args: {
    changeId: v.id("pendingChanges"),
  },
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) throw new Error("PendingChange not found");
    if (change.status !== "pending") {
      throw new Error(`Cannot approve change with status: ${change.status}`);
    }

    // Apply the actual data change based on changeType
    switch (change.changeType) {
      case "price_change":
        await applyPriceChange(ctx, change);
        break;
      case "menu_swap":
        await applyMenuSwap(ctx, change);
        break;
      case "ingredient_substitution":
        await applyIngredientSubstitution(ctx, change);
        break;
      case "recipe_update":
        await applyRecipeUpdate(ctx, change);
        break;
      case "quantity_adjustment":
        await applyQuantityAdjustment(ctx, change);
        break;
      case "rule_update":
        await applyRuleUpdate(ctx, change);
        break;
    }

    // Mark the PendingChange as approved
    await ctx.db.patch(changeId, {
      status: "approved",
      resolvedAt: Date.now(),
    });
  },
});

export const reject = mutation({
  args: {
    changeId: v.id("pendingChanges"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { changeId, reason }) => {
    const change = await ctx.db.get(changeId);
    if (!change) throw new Error("PendingChange not found");

    await ctx.db.patch(changeId, {
      status: "rejected",
      resolvedAt: Date.now(),
    });
  },
});

// --- Change applicators ---

async function applyPriceChange(
  ctx: { db: any },
  change: { sessionId: any; payload: any }
) {
  const { itemId, newPrice } = change.payload as {
    itemId: string;
    newPrice: number;
  };
  await ctx.db.patch(itemId, { price: newPrice });
}

async function applyMenuSwap(
  ctx: { db: any },
  change: { sessionId: any; payload: any }
) {
  const { removeItemId, addDishId, position } = change.payload as {
    removeItemId: string;
    addDishId: string;
    position: number;
  };
  await ctx.db.delete(removeItemId);
  await ctx.db.insert("sessionItems", {
    sessionId: change.sessionId,
    dishId: addDishId,
    position,
    addedAt: Date.now(),
  });
}

async function applyIngredientSubstitution(
  ctx: { db: any },
  change: { payload: any }
) {
  const { recipeId, oldIngredientId, newIngredientId, newQuantity } =
    change.payload as {
      recipeId: string;
      oldIngredientId: string;
      newIngredientId: string;
      newQuantity: number;
    };
  await ctx.db.patch(recipeId, {
    [`ingredients.${oldIngredientId}`]: undefined,
    [`ingredients.${newIngredientId}`]: newQuantity,
  });
}

async function applyRecipeUpdate(
  ctx: { db: any },
  change: { payload: any }
) {
  const { recipeId, updates } = change.payload as {
    recipeId: string;
    updates: Record<string, unknown>;
  };
  await ctx.db.patch(recipeId, updates);
}

async function applyQuantityAdjustment(
  ctx: { db: any },
  change: { payload: any }
) {
  const { itemId, newQuantity } = change.payload as {
    itemId: string;
    newQuantity: number;
  };
  await ctx.db.patch(itemId, { quantity: newQuantity });
}

async function applyRuleUpdate(
  ctx: { db: any },
  change: { sessionId: any; payload: any }
) {
  const { ruleType, ruleValue } = change.payload as {
    ruleType: string;
    ruleValue: unknown;
  };
  const session = await ctx.db.get(change.sessionId);
  const existingRules = session?.aiRules ?? {};
  await ctx.db.patch(change.sessionId, {
    aiRules: { ...existingRules, [ruleType]: ruleValue },
  });
}
```

### ApplyButton Component

```typescript
// src/features/ai-panel/components/ApplyButton.tsx
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

interface PendingAction {
  changeType: string;
  description: string;
  payload: unknown;
  impact: {
    revenue?: number;
    profit?: number;
    cost?: number;
  };
}

interface ApplyButtonProps {
  action: PendingAction;
  sessionId: Id<"sessions">;
}

export function ApplyButton({ action, sessionId }: ApplyButtonProps) {
  const [isApplying, setIsApplying] = useState(false);
  const createPendingChange = useMutation(api.pendingChanges.create);

  async function handleApply() {
    setIsApplying(true);
    try {
      await createPendingChange({
        sessionId,
        source: "chat_suggestion",
        changeType: action.changeType as any,
        description: action.description,
        payload: action.payload,
        impact: action.impact,
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <button
      onClick={handleApply}
      disabled={isApplying}
      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {isApplying && <Loader2 className="h-3 w-3 animate-spin" />}
      Apply
    </button>
  );
}
```

### PendingChange Overlay in Workspace

```typescript
// src/features/workspace/components/PendingChangeOverlay.tsx
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ImpactBadge } from "@/features/ai-panel/components/ImpactBadge";
import { Check, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

interface PendingChangeOverlayProps {
  changeId: Id<"pendingChanges">;
  description: string;
  impact: {
    revenue?: number;
    profit?: number;
    cost?: number;
  };
}

export function PendingChangeOverlay({
  changeId,
  description,
  impact,
}: PendingChangeOverlayProps) {
  const approve = useMutation(api.pendingChanges.approve);
  const reject = useMutation(api.pendingChanges.reject);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-blue-400 bg-blue-50/80 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-2 p-3 text-center">
        <p className="text-xs font-medium text-blue-900">{description}</p>

        <div className="flex gap-1.5">
          {impact.revenue != null && (
            <ImpactBadge label="Rev" value={impact.revenue} type="revenue" />
          )}
          {impact.profit != null && (
            <ImpactBadge label="Prof" value={impact.profit} type="profit" />
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => approve({ changeId })}
            className="inline-flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            <Check className="h-3 w-3" />
            Approve
          </button>
          <button
            onClick={() => reject({ changeId })}
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 8. Voice Input

The microphone button uses the Web Speech API (`SpeechRecognition`) for browser-native speech-to-text. Transcribed text is appended to the chat input field, where the user can review and send it.

### Voice Input Hook

```typescript
// src/features/ai-panel/hooks/useVoiceInput.ts
import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceInputOptions {
  onTranscript: (transcript: string) => void;
  lang?: string;
  continuous?: boolean;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
}

export function useVoiceInput({
  onTranscript,
  lang = "en-US",
  continuous = true,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    setError(null);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        onTranscript(last[0].transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, lang, continuous, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    error,
  };
}
```

### SpeechRecognition Type Augmentation

```typescript
// src/types/speech.d.ts
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface Window {
  SpeechRecognition: new () => SpeechRecognition;
  webkitSpeechRecognition: new () => SpeechRecognition;
}
```

### Voice UX Flow

```
1. User taps microphone icon
   → Button turns red, pulsing indicator
   → Browser requests microphone permission (first time)

2. User speaks: "Suggest a breakfast combo under ten dollars"
   → Web Speech API transcribes in real-time
   → Final transcript appended to input field

3. User reviews text in input field
   → Can edit before sending
   → Taps send (or presses Enter)

4. Message sent to AI as normal text
   → Agent processes, responds with suggestions
```

---

## 9. File Structure

```
src/features/ai-panel/
├── components/
│   ├── AICoWorkerPanel.tsx        # Root panel component (vertical flex layout)
│   ├── AIPanelHeader.tsx          # Header with model/session badges
│   ├── ProactiveCardsSection.tsx  # Container for proactive alert cards
│   ├── ProactiveCard.tsx          # Individual proactive card
│   ├── ImpactBadge.tsx            # Revenue/profit/cost badge
│   ├── ChatHistory.tsx            # Scrollable message list
│   ├── ChatMessage.tsx            # Individual message bubble
│   ├── SmoothText.tsx             # Token-by-token text animation
│   ├── SuggestionChips.tsx        # Context-aware quick actions
│   ├── ChatInput.tsx              # Text input + mic + send
│   └── ApplyButton.tsx            # Creates PendingChange from chat
├── hooks/
│   ├── useAIChat.ts               # Chat send/receive with streaming
│   ├── useUIMessages.ts           # Formatted messages with streaming
│   ├── useThread.ts               # Thread lifecycle per session
│   └── useVoiceInput.ts           # Web Speech API hook
├── constants.ts                   # STEP_SUGGESTIONS mapping
└── types.ts                       # UIMessage, PendingAction types

convex/agents/
├── chat.ts                        # sendMessage action
├── threads.ts                     # getOrCreateThread, getThreadBySession
├── messages.ts                    # CRUD for thread messages
└── context.ts                     # getSessionContext query

convex/
├── pendingChanges.ts              # create, listBySession, approve, reject
└── proactiveAlerts.ts             # listActive, dismiss, markApplied

src/features/workspace/components/
└── PendingChangeOverlay.tsx       # Approval overlay on workspace cells

src/types/
└── speech.d.ts                    # SpeechRecognition type defs
```

---

*Previous: [03-WORKSPACE-PANEL.md](./03-WORKSPACE-PANEL.md) -- The structured workspace*
*Next: [05-AGENT-ARCHITECTURE.md](./05-AGENT-ARCHITECTURE.md) -- Agent intelligence layer*
