import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaystackSignature } from "../src/adapters/paystack";

describe("Paystack webhook signature", () => {
  const secret = "sk_test_abc";
  const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "b.i.n" } }));
  const good = createHmac("sha512", secret).update(body).digest("hex");
  it("accepts a correctly signed body", () => expect(verifyPaystackSignature(body, good, secret)).toBe(true));
  it("rejects a tampered body or missing signature", () => {
    expect(verifyPaystackSignature(Buffer.from(body.toString().replace("b.i.n", "x.y.z")), good, secret)).toBe(false);
    expect(verifyPaystackSignature(body, undefined, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "short", secret)).toBe(false);
  });
});
