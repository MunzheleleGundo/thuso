import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentLinkGateway } from "@thuso/core";

const API = "https://api.paystack.co";

/** Paystack implementation of the PaymentLinkGateway port. Amounts are in cents (Paystack's subunit for ZAR). */
export function paystackGateway(secretKey: string): PaymentLinkGateway {
  return {
    async createLink(req) {
      const res = await fetch(`${API}/transaction/initialize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: req.email,
          amount: req.amountCents,
          currency: "ZAR",
          reference: req.reference,
          callback_url: req.callbackUrl,
          metadata: { ...req.metadata, custom_fields: [{ display_name: "For", variable_name: "description", value: req.description }] },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: { authorization_url?: string } };
      if (!res.ok || !body.status || !body.data?.authorization_url) {
        throw new Error(`Paystack could not create a payment link: ${body.message ?? res.status}`);
      }
      return { url: body.data.authorization_url };
    },
  };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using your secret key. */
export function verifyPaystackSignature(rawBody: Buffer, signature: string | undefined, secretKey: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Double-check a transaction with Paystack before trusting it. */
export async function verifyTransaction(reference: string, secretKey: string): Promise<{ ok: boolean; amountCents: number; currency: string }> {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; data?: { status?: string; amount?: number; currency?: string } };
  return { ok: !!body.status && body.data?.status === "success", amountCents: body.data?.amount ?? 0, currency: body.data?.currency ?? "" };
}
