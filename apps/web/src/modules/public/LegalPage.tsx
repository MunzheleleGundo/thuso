import { Link, useParams } from "react-router-dom";
import { Card, Logo } from "../../ui/kit";

/**
 * Placeholder legal pages. Replace this text with a privacy notice and terms reviewed by a
 * qualified person before launch (POPIA requires a clear privacy notice).
 */
export default function LegalPage() {
  const { doc } = useParams();
  const privacy = doc === "privacy";
  return (
    <div className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/"><Logo /></Link>
        <Card className="flex flex-col gap-4 p-8 text-[15px] leading-relaxed">
          <h1 className="text-[28px] font-extrabold">{privacy ? "Privacy notice" : "Terms of use"}</h1>
          <p className="rounded-[10px] bg-warn-50 px-4 py-3 font-semibold text-warn-700">Draft. This page must be replaced with reviewed text before THUSO is offered to the public.</p>
          {privacy ? (
            <>
              <p>THUSO, a Coding Wizards product, processes the personal information you give us (your name, email and business details) and the information you store about your customers, so that the service works.</p>
              <p>Customer details are used only by the business that collected them. Businesses must record each customer's consent before sending reminders.</p>
              <p>You can ask for a copy of your data or for it to be deleted. Invoices may be kept for as long as tax law requires.</p>
            </>
          ) : (
            <>
              <p>THUSO helps you run your business. Compliance guidance in THUSO is general information, not legal or tax advice.</p>
              <p>You are responsible for the accuracy of invoices you send and for the consent of customers you contact.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
