import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { authMessage, logOut, refreshVerification, resendVerification } from "../../adapters/auth";
import { usingEmulators } from "../../app/firebase";
import { useSession } from "../../app/session";
import { Icon } from "../../ui/icons";
import { Alert, Button, Card, Logo } from "../../ui/kit";

export default function VerifyEmailPage() {
  const { user, verified } = useSession();
  const nav = useNavigate();
  const [cooldown, setCooldown] = useState(45);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ tone: "red" | "green" | "amber"; text: string } | null>(null);

  // Count down before "Resend" is allowed, so people do not flood their inbox.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Notice verification in another tab without the user doing anything.
  useEffect(() => {
    if (!user || verified) return;
    const t = setInterval(() => { refreshVerification(user).then((ok) => ok && nav("/onboarding", { replace: true })).catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [user, verified, nav]);

  if (!user) return <Navigate to="/signin" replace />;
  if (verified) return <Navigate to="/onboarding" replace />;

  async function check() {
    setChecking(true); setMessage(null);
    try {
      if (await refreshVerification(user!)) nav("/onboarding", { replace: true });
      else setMessage({ tone: "amber", text: "Not verified yet. Click the link in the email, then try again." });
    } catch (e) { setMessage({ tone: "red", text: authMessage(e) }); }
    setChecking(false);
  }

  async function resend() {
    try { await resendVerification(user!); setCooldown(60); setMessage({ tone: "green", text: "We sent a new link." }); }
    catch (e) { setMessage({ tone: "red", text: authMessage(e) }); }
  }

  const mins = `${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface px-6 py-5 md:px-8"><Logo /></header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="flex w-full max-w-[480px] flex-col items-center gap-4 p-8 text-center sm:p-10">
          <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="mail" size={32} /></div>
          <h1 className="text-[28px] font-extrabold">Check your email</h1>
          <p className="text-[16px] leading-relaxed text-muted">
            We sent a verification link to <strong className="text-ink">{user.email}</strong>. Click the link to finish setting up THUSO.
          </p>
          {message && <div className="w-full text-left"><Alert tone={message.tone}>{message.text}</Alert></div>}
          <Button full onClick={check} loading={checking}>I have verified, continue</Button>
          <Button full variant="secondary" disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend email (${mins})` : "Resend email"}</Button>
          <p className="text-[14px] text-muted">Wrong address? <button type="button" className="font-bold text-brand-600" onClick={() => logOut().then(() => nav("/signup"))}>Sign up again</button></p>
          <div className="w-full rounded-[10px] bg-canvas px-4 py-3.5 text-left text-[13px] leading-relaxed text-muted">
            Cannot find it? Check your spam or promotions folder. The link expires after a while; use Resend if it does.
            {usingEmulators && <><br /><strong>Local emulator:</strong> open the Auth tab at localhost:4000 to find the link.</>}
          </div>
        </Card>
      </div>
    </div>
  );
}
