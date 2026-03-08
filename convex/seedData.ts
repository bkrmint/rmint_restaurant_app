import { query } from "./_generated/server";

/**
 * Public query to fetch all seed data for the setup verification page.
 * No auth required.
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const chains = await ctx.db.query("chains").collect();
    const restaurants = await ctx.db.query("restaurants").collect();
    const dishes = await ctx.db.query("dishes").collect();
    const menuTemplates = await ctx.db.query("menuTemplates").collect();
    const aiRules = await ctx.db.query("aiRules").collect();
    const ingredients = await ctx.db.query("ingredients").collect();

    return {
      chains,
      restaurants,
      dishes,
      menuTemplates,
      aiRules,
      ingredients,
    };
  },
});
