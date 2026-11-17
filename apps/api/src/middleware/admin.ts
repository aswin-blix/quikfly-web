import { createMiddleware } from "hono/factory";
import { can, type Permission } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { forbidden, unauthorized } from "../lib/errors";
import { adminForToken } from "../services/admin/auth";
import { bearerToken } from "./auth";

/**
 * Requires a valid admin bearer token and exposes the admin as `c.var.admin`.
 * With a permission, the admin's role must have it (see PERMISSIONS in @quikfly/shared).
 */
export const requireAdmin = (permission?: Permission) => createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c);
  const admin = token ? await adminForToken(c.env.DB, token) : null;
  if (!admin) throw unauthorized("Please sign in to the admin panel.");
  if (permission && !can(admin.role, permission)) throw forbidden();
  c.set("admin", admin);
  await next();
});
