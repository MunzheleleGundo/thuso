import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { isEmail } from "@thuso/core";
import { authMessage, passwordProblem, signInWithGoogle, signUpWithEmail } from "../../adapters/auth";
import { useSession } from "../../app/session";
import { Alert, Button, Checkbox, Field, Input } from "../../ui/kit";
import { AuthLayout, GoogleButton, OrDivider } from "./AuthLayout";

export default function SignUpPage() {
  const s = useSession();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (s.ready && s.user && !busy) return <Navigate to={s.verified ? "/app" : "/verify"} replace />;

  const errors = {
    name: name.trim().length < 2 ? "Enter your name." : null,
    email: !isEmail(email) ? "Enter a valid email address." : null,
    password: passwordProblem(password),
    agreed: !agreed ? "Please agree to continue." : null,
  };
  const valid = !Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy("email"); setError(null);
    try { await signUpWithEmail(name, email, password); nav("/verify", { replace: true }); }
    catch (err) { setError(authMessage(err)); setBusy(null); }
  }

  async function google() {
    if (!agreed) { setTouched(true); setError("Please agree to the terms first."); return; }
    setBusy("google"); setError(null);
    try { await signInWithGoogle(); nav("/onboarding", { replace: true }); }
    catch (err) { setError(authMessage(err)); setBusy(null); }
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <AuthLayout>
      <div>
        <h1 className="text-[30px] font-extrabold">Create your account</h1>
        <p className="mt-1.5 text-[15px] text-muted">Free to start. Takes about three minutes.</p>
      </div>
      <GoogleButton loading={busy === "google"} onClick={google} />
      <OrDivider />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Full name" htmlFor="su-name" error={show("name")}>
          <Input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" invalid={!!show("name")} />
        </Field>
        <Field label="Email" htmlFor="su-email" error={show("email")}>
          <Input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.co.za" invalid={!!show("email")} />
        </Field>
        <Field label="Password" htmlFor="su-pass" error={show("password")} hint="At least 8 characters, with letters and numbers.">
          <Input id="su-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose a password" invalid={!!show("password")} />
        </Field>
        <div>
          <Checkbox checked={agreed} onChange={setAgreed}
            label={<>I agree to the <a href="/legal/terms" target="_blank" className="font-bold text-brand-600">Terms</a> and the <a href="/legal/privacy" target="_blank" className="font-bold text-brand-600">Privacy notice</a>, and understand how THUSO uses my information under POPIA.</>} />
          {show("agreed") && <p className="text-[13px] font-semibold text-danger-600">{errors.agreed}</p>}
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" full loading={busy === "email"}>Create account</Button>
      </form>
      <p className="text-center text-[14px] text-muted">Already have an account? <Link to="/signin" className="font-bold text-brand-600">Sign in</Link></p>
    </AuthLayout>
  );
}
