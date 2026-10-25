import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authMessage, signInWithEmail, signInWithGoogle } from "../../adapters/auth";
import { useSession } from "../../app/session";
import { Alert, Button, Field, Input } from "../../ui/kit";
import { AuthLayout, GoogleButton, OrDivider } from "./AuthLayout";

export default function SignInPage() {
  const s = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (s.ready && s.user && !busy) return <Navigate to={next} replace />;

  async function go(kind: "email" | "google", fn: () => Promise<unknown>) {
    setBusy(kind); setError(null);
    try { await fn(); nav(next, { replace: true }); } catch (e) { setError(authMessage(e)); setBusy(null); }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void go("email", () => signInWithEmail(email, password)); };

  return (
    <AuthLayout>
      <div>
        <h1 className="text-[30px] font-extrabold">Welcome back</h1>
        <p className="mt-1.5 text-[15px] text-muted">Sign in to your workspace.</p>
      </div>
      <GoogleButton loading={busy === "google"} onClick={() => go("google", signInWithGoogle)} />
      <OrDivider />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="si-email">
          <Input id="si-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.co.za" />
        </Field>
        <Field label="Password" htmlFor="si-pass">
          <Input id="si-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </Field>
        <div className="-mt-1 text-right"><Link to="/forgot" className="text-[13px] font-bold text-brand-600">Forgot password?</Link></div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" full loading={busy === "email"} disabled={!email || !password}>Sign in</Button>
      </form>
      <p className="text-center text-[14px] text-muted">New to THUSO? <Link to="/signup" className="font-bold text-brand-600">Create an account</Link></p>
    </AuthLayout>
  );
}
