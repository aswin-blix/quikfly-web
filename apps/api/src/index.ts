import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_PREFIX } from "./config";
import type { AppEnv } from "./env";
import { HttpError } from "./lib/errors";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { share } from "./routes/share";
import { bookings } from "./routes/bookings";
import { buses } from "./routes/buses";
import { config, rentals, tours } from "./routes/catalog";
import { offers, quotes } from "./routes/quotes";
import { places } from "./routes/places";
import { rides } from "./routes/rides";
import { runScheduled } from "./scheduled";
import type { Env } from "./env";

const app = new Hono<AppEnv>();

app.use(cors({
  origin: (origin, c) => {
    const allowed = (c.env.ALLOWED_ORIGINS || "*").split(",").map((s: string) => s.trim());
    return allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : null;
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));

const v1 = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", auth)
  .route("/me", me)
  .route("/config", config)
  .route("/share", share)
  .route("/quotes", quotes)
  .route("/offers", offers)
  .route("/places", places)
  .route("/rides", rides)
  .route("/buses", buses)
  .route("/tours", tours)
  .route("/rentals", rentals)
  .route("/bookings", bookings)
  .route("/admin", admin);

app.get("/", (c) => c.json({ name: "QuikFly API", version: API_PREFIX.slice(1) }));
app.route(API_PREFIX, v1);

// Every error leaves as `{ message }`, which the website and the app both read.
app.notFound((c) => c.json({ message: "Not found." }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ message: err.message }, err.status);
  console.error(err);
  return c.json({ message: "Something went wrong. Please try again." }, 500);
});

export default {
  fetch: app.fetch,
  // Cron (every minute): ride reminders and push delivery.
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(runScheduled(env)),
} satisfies ExportedHandler<Env>;
