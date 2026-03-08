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

    const ingredients = [
      {
        name: "Chicken Breast",
        category: "protein" as const,
        unit: "lb",
        price: 4.5,
      },
      {
        name: "Basmati Rice",
        category: "grain" as const,
        unit: "lb",
        price: 1.8,
      },
      {
        name: "Fresh Salmon",
        category: "protein" as const,
        unit: "lb",
        price: 12.0,
      },
      {
        name: "Mixed Greens",
        category: "produce" as const,
        unit: "lb",
        price: 3.2,
      },
      {
        name: "Potatoes",
        category: "produce" as const,
        unit: "lb",
        price: 1.2,
      },
      {
        name: "Heavy Cream",
        category: "dairy" as const,
        unit: "qt",
        price: 4.0,
      },
      {
        name: "Olive Oil",
        category: "oil_fat" as const,
        unit: "L",
        price: 8.5,
      },
      {
        name: "Garam Masala",
        category: "spice" as const,
        unit: "oz",
        price: 2.4,
      },
    ];

    const ingredientIds: Record<string, string> = {};
    for (const ing of ingredients) {
      const id = await ctx.db.insert("ingredients", {
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
      ingredientIds[ing.name] = id;
    }

    const dishes = [
      {
        name: "Butter Chicken",
        category: "main" as const,
        cuisine: "Indian",
        price: 18.5,
        cost: 5.2,
        prep: 35,
      },
      {
        name: "Chicken Tikka Masala",
        category: "main" as const,
        cuisine: "Indian",
        price: 19.0,
        cost: 5.5,
        prep: 40,
      },
      {
        name: "Grilled Salmon",
        category: "main" as const,
        cuisine: "American",
        price: 24.0,
        cost: 9.0,
        prep: 25,
      },
      {
        name: "Caesar Salad",
        category: "appetizer" as const,
        cuisine: "American",
        price: 12.0,
        cost: 3.0,
        prep: 10,
      },
      {
        name: "Pad Thai",
        category: "main" as const,
        cuisine: "Thai",
        price: 16.0,
        cost: 4.8,
        prep: 20,
      },
      {
        name: "Margherita Pizza",
        category: "main" as const,
        cuisine: "Italian",
        price: 15.0,
        cost: 4.0,
        prep: 15,
      },
      {
        name: "Mango Sticky Rice",
        category: "dessert" as const,
        cuisine: "Thai",
        price: 10.0,
        cost: 2.8,
        prep: 30,
      },
      {
        name: "Tiramisu",
        category: "dessert" as const,
        cuisine: "Italian",
        price: 11.0,
        cost: 3.2,
        prep: 45,
      },
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

    await ctx.db.insert("aiRules", {
      scope: "chain",
      scopeId: String(chainId),
      ruleType: "margin_threshold",
      label: "Minimum 25% margin",
      description:
        "All dishes must maintain at least 25% profit margin",
      config: { operator: "gte", field: "margin", value: 25 },
      priority: 80,
      isActive: true,
      createdBy: "seed-user-001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("aiRules", {
      scope: "chain",
      scopeId: String(chainId),
      ruleType: "prep_time_limit",
      label: "Max 60 min prep time",
      config: {
        operator: "lte",
        field: "prepTimeMinutes",
        value: 60,
      },
      priority: 60,
      isActive: true,
      createdBy: "seed-user-001",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
