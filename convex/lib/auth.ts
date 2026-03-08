import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Get current user or throw. Use in mutations/queries that require auth.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

/**
 * Get current user id or null.
 */
export async function requireAuthIdOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Id<"users"> | null> {
  return getAuthUserId(ctx);
}

/**
 * Get current user or null. Use when auth is optional.
 */
export async function requireAuthOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}
