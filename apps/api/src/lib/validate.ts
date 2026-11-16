import type { Context } from "hono";
import { badRequest } from "./errors";

type Json = Record<string, unknown>;

/** Reads a JSON object body, or fails with 400. */
export async function jsonBody(c: Context): Promise<Json> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Request body must be a JSON object.");
  return body as Json;
}

export function str(src: Json, key: string, max = 200): string {
  const v = src[key];
  if (typeof v !== "string" || !v.trim()) throw badRequest(`"${key}" is required.`);
  if (v.length > max) throw badRequest(`"${key}" is too long.`);
  return v.trim();
}

export function optStr(src: Json, key: string, max = 200): string | undefined {
  return src[key] === undefined || src[key] === null || src[key] === "" ? undefined : str(src, key, max);
}

export function oneOf<T extends string>(src: Json, key: string, allowed: readonly T[]): T {
  const v = src[key];
  if (typeof v !== "string" || !allowed.includes(v as T)) throw badRequest(`"${key}" must be one of: ${allowed.join(", ")}.`);
  return v as T;
}

export function query(c: Context, key: string): string {
  const v = c.req.query(key)?.trim();
  if (!v) throw badRequest(`Query parameter "${key}" is required.`);
  return v;
}
