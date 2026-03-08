// Convex schema — see docs/architecture/06-DATA-LAYER.md
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

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
});
