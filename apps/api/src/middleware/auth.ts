import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { unauthorized } from "../lib/errors";
import { userForToken } from "../services/auth";

/** The token from `Authorization: Bearer <token>`, if any. */
export const bearerToken = (c: Context) => c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

/** Requires a valid bearer token and exposes the user as `c.var.user`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c);
  const user = token ? await userForToken(c.env.DB, token) : null;
  if (!user) throw unauthorized();
  c.set("user", user);
  await next();
});
