// Mock (demo mode) support: callback requests and tickets stored in this browser, with the
// API's limits. Demo mode has no staff, so nothing is answered (the page says so).
import { LIMITS, SUPPORT_RULES, type SupportTicket } from "@quikfly/shared";
import type { QuikflyApi } from "./contract";
import { currentUser, fail, load, save, signedInUser, uid, wait } from "./mock-store";

const KEY = "quikfly.mockSupport";
const all = () => load<SupportTicket[]>(KEY, []);
const tenDigits = (phone: string) => {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d}` : fail("Enter a valid 10-digit mobile number.");
};
const mine = (id: string) => all().find((t) => t.id === id && t.phone === currentUser().phone) ?? fail("Ticket not found.");
function store(t: SupportTicket) { save(KEY, [t, ...all().filter((x) => x.id !== t.id)]); return t; }
const message = (body: string) => ({ id: uid("SM"), author: "customer" as const, staffName: null, body, createdAt: new Date().toISOString() });

export const mockSupport: QuikflyApi["support"] = {
  async requestCallback(input) {
    await wait(500);
    if (input.name.trim().length < LIMITS.nameMin) fail("Enter your name.");
    const phone = tenDigits(input.phone);
    const since = Date.now() - 86_400_000;
    if (all().filter((t) => t.kind === "callback" && t.phone === phone && Date.parse(t.createdAt) > since).length >= SUPPORT_RULES.callbacksPerDay) fail("We already have your callback requests for today. Our team will call you soon.");
    const now = new Date().toISOString();
    const signedIn = signedInUser();
    return store({ id: uid("SP"), kind: "callback", status: "open", topic: input.topic, bookingId: null, ref: input.ref ?? null, name: input.name.trim(),
      phone: signedIn?.phone ?? phone, preferredTime: input.preferredTime, createdAt: now, updatedAt: now, messages: [message(input.message?.trim() || "Please call me back.")] });
  },
  async list() { await wait(250); const u = currentUser(); return all().filter((t) => t.phone === u.phone).map((t) => ({ ...t, messages: t.messages.slice(0, 1) })); },
  async get(id) { await wait(200); return mine(id); },
  async open(input) {
    await wait(500);
    const u = currentUser();
    if (input.message.trim().length < SUPPORT_RULES.messageMin) fail("Tell us a little more.");
    if (all().filter((t) => t.phone === u.phone && t.kind === "ticket" && t.status !== "closed").length >= SUPPORT_RULES.openTickets) fail(`You have ${SUPPORT_RULES.openTickets} open tickets. Please reply in one of them, or close one first.`);
    const now = new Date().toISOString();
    return store({ id: uid("SP"), kind: "ticket", status: "open", topic: input.topic, bookingId: input.bookingId ?? null, ref: null, name: u.name, phone: u.phone,
      preferredTime: null, createdAt: now, updatedAt: now, messages: [message(input.message.trim())] });
  },
  async reply(id, body) {
    await wait(300);
    const t = mine(id);
    if (t.status === "closed") fail("This ticket is closed. Please open a new one.");
    return store({ ...t, status: "open", updatedAt: new Date().toISOString(), messages: [...t.messages, message(body.trim())] });
  },
  async close(id) { await wait(300); return store({ ...mine(id), status: "closed", updatedAt: new Date().toISOString() }); },
};
