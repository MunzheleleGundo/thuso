import { useSearchParams } from "react-router-dom";
import { Icon } from "../../ui/icons";
import { Card, Logo } from "../../ui/kit";

/** Where Paystack sends the customer after paying. The invoice is updated by the verified webhook, not by this page. */
export default function PaidPage() {
  const [params] = useSearchParams();
  const ref = params.get("reference") ?? params.get("trxref");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-5">
      <Logo />
      <Card className="flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="check" size={30} strokeWidth={2.4} /></div>
        <h1 className="text-[24px] font-extrabold">Thank you</h1>
        <p className="text-[15px] leading-relaxed text-muted">Your payment is being confirmed. The business will see it on their invoice within a minute. You can close this page.</p>
        {ref && <p className="text-[12px] text-muted">Reference: {ref}</p>}
      </Card>
    </div>
  );
}
