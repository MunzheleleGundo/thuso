import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isEmail } from "@thuso/core";
import { authMessage, sendReset } from "../../adapters/auth";
import { Alert, Button, Field, Input } from "../../ui/kit";
import { AuthLayout } from "./AuthLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) { setError("Enter a valid email address."); return; }
    setBusy(true); setError(null);
    try { await sendReset(email); setSent(true); }
    catch (err) {
      // Do not reveal whether an account exists.
      if ((err as { code?: string }).code === "auth/user-not-found") setSent(true); else setError(authMessage(err));
    }
    setBusy(false);
  }

  return (
    <AuthLayout>
      <div>
        <h1 className="text-[30px] font-extrabold">Reset your password</h1>
        <p className="mt-1.5 text-[15px] text-muted">We will email you a link to choose a new one.</p>
      </div>
      {sent ? (
        <Alert tone="green">If there is an account for {email}, a reset link is on its way. Check your inbox and spam folder.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="fp-email">
            <Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.co.za" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" full loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="text-center text-[14px] text-muted"><Link to="/signin" className="font-bold text-brand-600">Back to sign in</Link></p>
    </AuthLayout>
  );
}
