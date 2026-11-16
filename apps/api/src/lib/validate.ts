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

/** True when the key is present in the body (null counts: it means "clear"). */
export const has = (src: Json, key: string) => key in src && src[key] !== undefined;

export function bool(src: Json, key: string): boolean {
  if (typeof src[key] !== "boolean") throw badRequest(`"${key}" must be true or false.`);
  return src[key] as boolean;
}

export function int(src: Json, key: string, min: number, max: number): number {
  const v = src[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw badRequest(`"${key}" must be a whole number from ${min} to ${max}.`);
  return v;
}

/** A string of min..max characters. */
export function text(src: Json, key: string, min: number, max: number): string {
  const v = str(src, key, max);
  if (v.length < min) throw badRequest(`"${key}" must be at least ${min} characters.`);
  return v;
}

export function matches(value: string, pattern: RegExp, message: string): string {
  if (!pattern.test(value)) throw badRequest(message);
  return value;
}

export function query(c: Context, key: string): string {
  const v = c.req.query(key)?.trim();
  if (!v) throw badRequest(`Query parameter "${key}" is required.`);
  return v;
}
