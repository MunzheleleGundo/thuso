/**
 * THUSO Cloud Functions. Each handler is thin: check the caller, call a core use case,
 * apply the resulting writes. Business rules live in @thuso/core.
 */
import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {
  askAssistant, C, computeAvailability, normalizePhone, DAY, formatInvoiceNumber, instantToLocalDate, isEnabled, isLocalDate, parsePaymentReference,
  planProviderPayment, planPublicBooking, requestPaymentLink, sanitizeHistory, startOfLocalDay, sub, toWrites, WEEKDAYS,
  type AssistantContext, type AssistantMode, type Business,
} from "@thuso/core";
import { adminWriter, applyWrites, businessBySlug, db, newId, readers } from "./adapters/firestore";
import { geminiGateway } from "./adapters/gemini";
import { paystackGateway, verifyPaystackSignature, verifyTransaction } from "./adapters/paystack";
import { fail, requireMember, str } from "./auth";

initializeApp();

/** Region for all functions. Keep VITE_FUNCTIONS_REGION in the web app in sync. */
const REGION = "europe-west1";
setGlobalOptions({ region: REGION, maxInstances: 10 });

const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = defineString("GEMINI_MODEL", { default: "gemini-3.8-flash" });
const APP_URL = defineString("APP_URL", { default: "http://localhost:5173" });
const PAYMENT_FALLBACK_EMAIL = defineString("PAYMENT_FALLBACK_EMAIL", { default: "payments@thuso.app" });
const AI_DAILY_LIMIT = defineInt("AI_DAILY_LIMIT", { default: 100 });

// ---------------------------------------------------------------- invoice numbers

/** Sequential numbers per business, assigned in a transaction so two invoices never share one. */
async function ensureInvoiceNumber(bizId: string, invoiceId: string): Promise<string | null> {
  const fs = db();
  const invRef = fs.doc(sub(bizId, C.invoices, invoiceId));
  const counterRef = fs.doc(sub(bizId, C.counters, "invoices"));
  return fs.runTransaction(async (tx) => {
    const [inv, counter] = await Promise.all([tx.get(invRef), tx.get(counterRef)]);
    if (!inv.exists) return null;
    const existing = inv.get("number");
    if (typeof existing === "string" && existing) return existing;
    const next = (counter.exists ? (counter.get("next") as number) : 1) || 1;
    const number = formatInvoiceNumber(next);
    tx.set(counterRef, { next: next + 1 }, { merge: true });
    tx.set(invRef, { number }, { merge: true });
    return number;
  });
}

export const assignInvoiceNumber = onDocumentCreated(`${C.businesses}/{bizId}/${C.invoices}/{invoiceId}`, async (event) => {
  await ensureInvoiceNumber(event.params.bizId, event.params.invoiceId);
});

// ---------------------------------------------------------------- payments

export const createPaymentLink = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (req) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const m = await requireMember(req, data.bizId, { write: true, module: "invoicing" });
  const invoiceId = str(data.invoiceId, 64);
  const number = await ensureInvoiceNumber(m.business.id, invoiceId);
  if (!number) throw new HttpsError("not-found", "We could not find this invoice.");
  const invoice = await readers().invoices.get(m.business.id, invoiceId);
  if (!invoice) throw new HttpsError("not-found", "We could not find this invoice.");
  // Reuse a recent link for the same balance instead of creating a new provider transaction.
  if (invoice.paymentLink && invoice.paidCents === 0 && invoice.status !== "cancelled" && Date.now() - invoice.paymentLink.createdAt < 20 * 3600_000) {
    return { url: invoice.paymentLink.url, number };
  }
  const secret = PAYSTACK_SECRET_KEY.value();
  if (!secret) throw new HttpsError("failed-precondition", "Online payments are not set up yet. Add a Paystack secret key.");
  const r = await requestPaymentLink({
    bizId: m.business.id, invoice, businessName: m.business.name, fallbackEmail: PAYMENT_FALLBACK_EMAIL.value(),
    gateway: paystackGateway(secret), callbackUrl: `${APP_URL.value()}/paid`, nonce: newId().slice(0, 8),
    now: Date.now(), actor: { uid: m.uid, name: m.name }, auditId: newId(),
  }).catch((e: unknown) => {
    logger.error("payment link failed", e);
    throw new HttpsError("unavailable", "The payment provider did not respond. Please try again in a minute.");
  });
  if (!r.ok) fail(r.error);
  await adminWriter.commit(m.business.id, r.value.ops);
  return { url: r.value.invoice.paymentLink?.url ?? "", number };
});

export const paystackWebhook = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  const secret = PAYSTACK_SECRET_KEY.value();
  if (!secret || !verifyPaystackSignature(req.rawBody, req.get("x-paystack-signature"), secret)) {
    res.status(401).send("Invalid signature");
    return;
  }
  const event = req.body as { event?: string; data?: { reference?: string; amount?: number; currency?: string } };
  if (event.event !== "charge.success" || !event.data?.reference) { res.status(200).send("ignored"); return; }
  const reference = event.data.reference;
  const parsed = parsePaymentReference(reference);
  if (!parsed) { res.status(200).send("unknown reference"); return; }
  try {
    const check = await verifyTransaction(reference, secret);
    if (!check.ok || check.currency !== "ZAR") { logger.warn("unverified payment", { reference }); res.status(200).send("unverified"); return; }
    const fs = db();
    await fs.runTransaction(async (tx) => {
      const inv = await readers(tx).invoices.get(parsed.bizId, parsed.invoiceId);
      const paid = await tx.get(fs.doc(sub(parsed.bizId, C.payments, reference)));
      if (!inv) { logger.warn("payment for missing invoice", { reference }); return; }
      const plan = planProviderPayment({ invoice: inv, alreadyRecorded: paid.exists, reference, amountCents: check.amountCents, now: Date.now() });
      if (!plan.ok) { logger.warn("payment not applied", plan.error); return; }
      applyWrites(tx, toWrites(parsed.bizId, plan.value.ops, "server"));
    });
    res.status(200).send("ok");
  } catch (e) {
    logger.error("webhook failed", e);
    res.status(500).send("error"); // Paystack retries failed webhooks
  }
});

// ---------------------------------------------------------------- public booking page (no account needed)

function publicBusiness(b: Business) {
  return {
    name: b.name, slug: b.slug, town: b.town, province: b.province, phone: b.contactPhone,
    bookable: isEnabled(b.enabledModules, "bookings") && !!b.schedule,
    utcOffsetMinutes: b.utcOffsetMinutes,
    maxAdvanceDays: b.schedule?.maxAdvanceDays ?? 0,
    openDays: b.schedule ? WEEKDAYS.filter((d) => b.schedule!.days[d].open) : [],
    hours: b.schedule ? Object.fromEntries(WEEKDAYS.map((d) => [d, b.schedule!.days[d].open ? `${b.schedule!.days[d].from}-${b.schedule!.days[d].to}` : null])) : {},
  };
}

export const publicBookingPage = onCall(async (req) => {
  const b = await businessBySlug(str((req.data as Record<string, unknown>)?.slug, 60));
  if (!b) throw new HttpsError("not-found", "We could not find this booking page.");
  const services = isEnabled(b.enabledModules, "bookings") ? (await readers().services.list(b.id)).filter((s) => s.active) : [];
  return {
    business: publicBusiness(b),
    services: services.map((s) => ({ id: s.id, name: s.name, description: s.description, durationMinutes: s.durationMinutes, priceCents: s.priceCents, depositCents: s.depositCents })),
  };
});

export const publicAvailability = onCall(async (req) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const b = await businessBySlug(str(data.slug, 60));
  if (!b || !isEnabled(b.enabledModules, "bookings")) throw new HttpsError("not-found", "We could not find this booking page.");
  const date = str(data.date, 10);
  if (!isLocalDate(date)) throw new HttpsError("invalid-argument", "Choose a date.");
  const service = await readers().services.get(b.id, str(data.serviceId, 64));
  if (!service || !service.active) throw new HttpsError("not-found", "This service is not available.");
  const dayStart = startOfLocalDay(Date.parse(`${date}T12:00:00Z`), b.utcOffsetMinutes);
  const list = await readers().bookings.listBetween(b.id, dayStart - DAY, dayStart + 2 * DAY);
  return { date, times: computeAvailability({ business: b, service, localDate: date, bookingsThatDay: list, now: Date.now() }) };
});

export const createPublicBooking = onCall(async (req) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  if (str(data.website)) throw new HttpsError("invalid-argument", "Something went wrong."); // honeypot field for bots
  const b = await businessBySlug(str(data.slug, 60));
  if (!b) throw new HttpsError("not-found", "We could not find this booking page.");
  const startAt = Number(data.startAt);
  if (!Number.isFinite(startAt)) throw new HttpsError("invalid-argument", "Choose a time.");
  const consent = (data.consent ?? {}) as Record<string, unknown>;
  const fs = db();
  const bookingId = newId();
  const newCustomerId = newId();
  try {
    const result = await fs.runTransaction(async (tx) => {
      const r = readers(tx);
      const [business, service] = await Promise.all([r.businesses.get(b.id), r.services.get(b.id, str(data.serviceId, 64))]);
      if (!business || !service) throw new HttpsError("not-found", "This service is not available.");
      const phone = str(data.phone, 30);
      const email = str(data.email, 120).toLowerCase();
      const existing = await r.customers.findByContact(b.id, { phone: normalizePhone(phone) ?? undefined, email: email || undefined });
      const dayStart = startOfLocalDay(startAt, business.utcOffsetMinutes);
      const sameDay = await r.bookings.listBetween(b.id, dayStart - DAY, dayStart + 2 * DAY);
      const plan = planPublicBooking({
        bookingId, newCustomerId, business, service, existingCustomer: existing,
        customerInput: { name: str(data.name, 80), phone, email, consent: { whatsapp: consent.whatsapp === true, sms: consent.sms === true, email: consent.email === true } },
        startAt, now: Date.now(), bookingsThatDay: sameDay, notes: str(data.notes, 500),
      });
      if (!plan.ok) fail(plan.error);
      applyWrites(tx, toWrites(b.id, plan.value.ops, "server"));
      return plan.value.booking;
    });
    return {
      bookingId: result.id, status: result.status, startAt: result.startAt, endAt: result.endAt, serviceName: result.serviceName,
      priceCents: result.priceCents, depositCents: result.depositCents, businessName: b.name, businessPhone: b.contactPhone,
      localDate: instantToLocalDate(result.startAt, b.utcOffsetMinutes),
    };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    // A slot lock already existed: someone else booked this time a moment ago.
    if ((e as { code?: number }).code === 6) throw new HttpsError("already-exists", "Sorry, that time was just taken. Please choose another time.");
    logger.error("public booking failed", e);
    throw new HttpsError("internal", "We could not make the booking. Please try again.");
  }
});

// ---------------------------------------------------------------- assistants

async function countAiUse(bizId: string, limit: number): Promise<boolean> {
  const fs = db();
  const ref = fs.doc(sub(bizId, C.private, "aiUsage"));
  const today = new Date().toISOString().slice(0, 10);
  return fs.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const count = s.get("date") === today ? ((s.get("count") as number) ?? 0) : 0;
    if (count >= limit) return false;
    tx.set(ref, { date: today, count: count + 1 });
    return true;
  });
}

export const askThuso = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (req) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const m = await requireMember(req, data.bizId);
  const mode: AssistantMode = data.mode === "general" ? "general" : "business";
  const history = sanitizeHistory(data.history);
  const key = GEMINI_API_KEY.value();
  if (!key) throw new HttpsError("failed-precondition", "Ask THUSO is not set up yet. Add a Gemini API key.");
  if (!(await countAiUse(m.business.id, AI_DAILY_LIMIT.value()))) {
    throw new HttpsError("resource-exhausted", "You have used today's Ask THUSO questions. They reset at midnight.");
  }
  const r = readers();
  const ctx: AssistantContext = {
    business: m.business, now: Date.now(), customers: r.customers, services: r.services, bookings: r.bookings,
    invoices: r.invoices, stock: r.stock, actions: [],
  };
  try {
    const out = await askAssistant({ mode, history, gateway: geminiGateway(key, GEMINI_MODEL.value()), ctx });
    if (!out.ok) fail(out.error);
    return out.value;
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("assistant failed", e);
    throw new HttpsError("unavailable", "Ask THUSO is having trouble right now. Please try again shortly.");
  }
});
