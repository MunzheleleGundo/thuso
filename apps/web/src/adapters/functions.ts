/** Typed wrappers around the Cloud Functions callables. */
import { httpsCallable, type FunctionsError } from "firebase/functions";
import type { AssistantMode, AssistantReply } from "@thuso/core";
import { functions } from "../app/firebase";

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (req: Req): Promise<Res> => (await fn(req)).data;
}

export interface PublicService {
  id: string; name: string; description: string; durationMinutes: number; priceCents: number; depositCents: number;
}
export interface PublicBusiness {
  name: string; slug: string; town: string; province: string; phone: string; bookable: boolean;
  utcOffsetMinutes: number; maxAdvanceDays: number; openDays: string[]; hours: Record<string, string | null>;
}
export interface PublicBookingResult {
  bookingId: string; status: "requested" | "confirmed"; startAt: number; endAt: number; serviceName: string;
  priceCents: number; depositCents: number; businessName: string; businessPhone: string; localDate: string;
}

export const api = {
  createPaymentLink: call<{ bizId: string; invoiceId: string }, { url: string; number: string }>("createPaymentLink"),
  askThuso: call<{ bizId: string; mode: AssistantMode; history: { role: "user" | "assistant"; text: string }[] }, AssistantReply>("askThuso"),
  publicBookingPage: call<{ slug: string }, { business: PublicBusiness; services: PublicService[] }>("publicBookingPage"),
  publicAvailability: call<{ slug: string; serviceId: string; date: string }, { date: string; times: number[] }>("publicAvailability"),
  createPublicBooking: call<{
    slug: string; serviceId: string; startAt: number; name: string; phone: string; email: string;
    consent: { whatsapp: boolean; sms: boolean; email: boolean }; notes: string; website: string;
  }, PublicBookingResult>("createPublicBooking"),
};

/** Plain-language message from a callable error. */
export function callableMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const fe = e as Partial<FunctionsError>;
  if (fe?.code === "functions/unavailable" && !navigator.onLine) return "You are offline. This needs a connection.";
  if (fe?.code === "functions/internal" && !fe.message) return fallback;
  return fe?.message && !fe.message.startsWith("internal") ? fe.message : fallback;
}
