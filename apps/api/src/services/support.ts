// Customer support (packages/shared/src/support.ts): callback requests from anyone, tickets
// from signed-in customers, and the staff queue that answers both. Staff replies and closes
// are audited (in the same batch) and notify the customer when the ticket has an account.
import { SUPPORT_RULES, type AdminSupportTicket, type CallbackTime, type SupportMessage, type SupportTicket, type SupportTopic } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { auditStatement } from "./admin/audit";
import { notify } from "./notifications";

interface TicketRow {
  id: string; user_id: string | null; kind: SupportTicket["kind"]; status: SupportTicket["status"]; topic: SupportTopic;
  booking_id: string | null; ref: string | null; name: string; phone: string; preferred_time: CallbackTime | null;
  created_at: string; updated_at: string;
}
interface MessageRow { id: string; ticket_id: string; author: "customer" | "staff"; admin_id: string | null; staff_name: string | null; body: string; created_at: string }

const toMessage = (m: MessageRow): SupportMessage => ({
  id: m.id, author: m.author, staffName: m.author === "staff" ? (m.staff_name ?? "QuikFly").split(" ")[0] : null, body: m.body, createdAt: m.created_at,
});
const toTicket = (r: TicketRow, messages: MessageRow[]): AdminSupportTicket => ({
  id: r.id, kind: r.kind, status: r.status, topic: r.topic, bookingId: r.booking_id, ref: r.ref, name: r.name, phone: r.phone,
  preferredTime: r.preferred_time, createdAt: r.created_at, updatedAt: r.updated_at, messages: messages.map(toMessage), customerId: r.user_id,
});
/** Customers don't see the account id field. */
const forCustomer = ({ customerId: _c, ...t }: AdminSupportTicket): SupportTicket => t;

const MESSAGES_SQL = `SELECT m.*, a.name AS staff_name FROM support_messages m LEFT JOIN admin_users a ON a.id = m.admin_id`;

/** Messages for these tickets: the whole thread, or only the first message of each (lists). */
async function messagesFor(db: D1Database, ids: string[], firstOnly: boolean): Promise<Map<string, MessageRow[]>> {
  const map = new Map<string, MessageRow[]>();
  if (!ids.length) return map;
  const { results } = await db.prepare(`${MESSAGES_SQL} WHERE m.ticket_id IN (SELECT value FROM json_each(?)) ORDER BY m.created_at`)
    .bind(JSON.stringify(ids)).all<MessageRow>();
  for (const m of results) {
    const list = map.get(m.ticket_id) ?? [];
    if (!firstOnly || !list.length) map.set(m.ticket_id, [...list, m]);
  }
  return map;
}

function insertTicket(db: D1Database, t: Omit<TicketRow, "created_at" | "updated_at" | "status">, body: string, now: string) {
  return [
    db.prepare(
      `INSERT INTO support_tickets (id, user_id, kind, status, topic, booking_id, ref, name, phone, preferred_time, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(t.id, t.user_id, t.kind, t.topic, t.booking_id, t.ref, t.name, t.phone, t.preferred_time, now, now),
    db.prepare("INSERT INTO support_messages (id, ticket_id, author, admin_id, body, created_at) VALUES (?, ?, 'customer', NULL, ?, ?)").bind(uid("SM"), t.id, body, now),
  ];
}

/** A callback request (anyone). Limited per phone number per day so the queue can't be flooded. */
export async function requestCallback(
  db: D1Database,
  input: { name: string; phone: string; topic: SupportTopic; preferredTime: CallbackTime; message?: string; ref?: string },
  userId: string | null,
): Promise<SupportTicket> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE kind = 'callback' AND phone = ? AND created_at > ?").bind(input.phone, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= SUPPORT_RULES.callbacksPerDay) throw conflict("We already have your callback requests for today. Our team will call you soon.");
  const now = new Date().toISOString();
  const id = uid("SP");
  await db.batch(insertTicket(db, { id, user_id: userId, kind: "callback", topic: input.topic, booking_id: null, ref: input.ref ?? null, name: input.name, phone: input.phone, preferred_time: input.preferredTime }, input.message?.trim() || "Please call me back.", now));
  return forCustomer(await ticketById(db, id));
}

/** A ticket from a signed-in customer, optionally about one of their bookings. */
export async function openTicket(
  db: D1Database, user: { id: string; name: string; phone: string },
  input: { topic: SupportTopic; message: string; bookingId?: string },
): Promise<SupportTicket> {
  const open = await db.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE user_id = ? AND kind = 'ticket' AND status <> 'closed'").bind(user.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= SUPPORT_RULES.openTickets) throw conflict(`You have ${SUPPORT_RULES.openTickets} open tickets. Please reply in one of them, or close one first.`);
  if (input.bookingId) {
    const mine = await db.prepare("SELECT 1 AS ok FROM bookings WHERE id = ? AND user_id = ?").bind(input.bookingId, user.id).first();
    if (!mine) throw badRequest("That booking isn't on your account.");
  }
  const now = new Date().toISOString();
  const id = uid("SP");
  await db.batch(insertTicket(db, { id, user_id: user.id, kind: "ticket", topic: input.topic, booking_id: input.bookingId ?? null, ref: null, name: user.name, phone: user.phone, preferred_time: null }, input.message, now));
  return forCustomer(await ticketById(db, id));
}

async function ticketById(db: D1Database, id: string): Promise<AdminSupportTicket> {
  const row = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first<TicketRow>();
  if (!row) throw notFound("Ticket not found.");
  return toTicket(row, (await messagesFor(db, [id], false)).get(id) ?? []);
}

/** The customer's tickets and callbacks, newest activity first (first message only). */
export async function myTickets(db: D1Database, userId: string): Promise<SupportTicket[]> {
  const { results } = await db.prepare("SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").bind(userId).all<TicketRow>();
  const msgs = await messagesFor(db, results.map((r) => r.id), true);
  return results.map((r) => forCustomer(toTicket(r, msgs.get(r.id) ?? [])));
}

async function ownTicket(db: D1Database, userId: string, id: string) {
  const t = await ticketById(db, id).catch(() => null);
  if (!t || t.customerId !== userId) throw notFound("Ticket not found.");
  return t;
}

export const myTicket = async (db: D1Database, userId: string, id: string) => forCustomer(await ownTicket(db, userId, id));

/** The customer replies: the ticket goes back to "open" (waiting for QuikFly). */
export async function customerReply(db: D1Database, userId: string, id: string, body: string): Promise<SupportTicket> {
  const t = await ownTicket(db, userId, id);
  if (t.status === "closed") throw conflict("This ticket is closed. Please open a new one.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO support_messages (id, ticket_id, author, admin_id, body, created_at) VALUES (?, ?, 'customer', NULL, ?, ?)").bind(uid("SM"), id, body, now),
    db.prepare("UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(now, id),
  ]);
  return myTicket(db, userId, id);
}

export async function customerClose(db: D1Database, userId: string, id: string): Promise<SupportTicket> {
  await ownTicket(db, userId, id);
  await db.prepare("UPDATE support_tickets SET status = 'closed', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return myTicket(db, userId, id);
}

// ── Staff ──

/** The queue: open (waiting for QuikFly) first by age, or answered / closed by recent activity. */
export async function supportQueue(db: D1Database, status: SupportTicket["status"]): Promise<AdminSupportTicket[]> {
  const order = status === "open" ? "updated_at ASC" : "updated_at DESC";
  const { results } = await db.prepare(`SELECT * FROM support_tickets WHERE status = ? ORDER BY ${order} LIMIT 100`).bind(status).all<TicketRow>();
  const msgs = await messagesFor(db, results.map((r) => r.id), true);
  return results.map((r) => toTicket(r, msgs.get(r.id) ?? []));
}

export const supportTicket = ticketById;

/** A staff reply (audited); the customer is notified when the ticket has an account. */
export async function staffReply(db: D1Database, adminId: string, id: string, body: string): Promise<AdminSupportTicket> {
  const t = await ticketById(db, id);
  if (t.status === "closed") throw conflict("This ticket is closed.");
  const now = new Date().toISOString();
  const messageId = uid("SM");
  await db.batch([
    db.prepare("INSERT INTO support_messages (id, ticket_id, author, admin_id, body, created_at) VALUES (?, ?, 'staff', ?, ?, ?)").bind(messageId, id, adminId, body, now),
    db.prepare("UPDATE support_tickets SET status = 'answered', updated_at = ? WHERE id = ?").bind(now, id),
    auditStatement(db, { adminId, action: "support.reply", entity: "support", entityId: id, detail: { kind: t.kind, length: body.length } }),
  ]);
  if (t.customerId) {
    await notify(db, t.customerId, {
      kind: "support.reply", ref: messageId, bookingId: t.bookingId,
      title: t.kind === "callback" ? "QuikFly replied to your callback request" : "QuikFly replied to your ticket",
      body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    });
  }
  return ticketById(db, id);
}

/** Staff close a ticket or callback (audited), with an optional note added to the thread. */
export async function staffClose(db: D1Database, adminId: string, id: string, note?: string): Promise<AdminSupportTicket> {
  const t = await ticketById(db, id);
  if (t.status === "closed") throw conflict("This ticket is already closed.");
  const now = new Date().toISOString();
  await db.batch([
    ...(note ? [db.prepare("INSERT INTO support_messages (id, ticket_id, author, admin_id, body, created_at) VALUES (?, ?, 'staff', ?, ?, ?)").bind(uid("SM"), id, adminId, note, now)] : []),
    db.prepare("UPDATE support_tickets SET status = 'closed', updated_at = ? WHERE id = ?").bind(now, id),
    auditStatement(db, { adminId, action: "support.close", entity: "support", entityId: id, detail: { kind: t.kind, note: note ?? null } }),
  ]);
  return ticketById(db, id);
}
