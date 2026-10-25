import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { initials, isEnabled, type ModuleId } from "@thuso/core";
import { logOut } from "../../adapters/auth";
import { useOnline } from "../../adapters/live";
import { useWorkspace } from "../../app/session";
import { Icon, type IconName } from "../../ui/icons";
import { cn, IconButton, Logo } from "../../ui/kit";
import { AskPanel } from "../assistant/AskPanel";

interface NavItem { to: string; label: string; icon: IconName; module?: ModuleId }
const NAV: NavItem[] = [
  { to: "/app", label: "Home", icon: "home" },
  { to: "/app/customers", label: "Customers", icon: "users", module: "customers" },
  { to: "/app/bookings", label: "Bookings", icon: "calendar", module: "bookings" },
  { to: "/app/invoices", label: "Invoices", icon: "invoice", module: "invoicing" },
  { to: "/app/stock", label: "Stock", icon: "box", module: "stock" },
];

export default function AppShell() {
  const { business, role, actor } = useWorkspace();
  const online = useOnline();
  const loc = useLocation();
  const nav = useNavigate();
  const [askOpen, setAskOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((i) => !i.module || isEnabled(business.enabledModules, i.module));
  const canManage = role === "owner" || role === "admin";

  useEffect(() => setMenuOpen(false), [loc.pathname]);
  useEffect(() => {
    const open = () => setAskOpen(true);
    window.addEventListener("thuso:ask", open);
    return () => window.removeEventListener("thuso:ask", open);
  }, []);

  const link = (i: NavItem) => (
    <NavLink key={i.to} to={i.to} end={i.to === "/app"}
      className={({ isActive }) => cn("flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[14px] no-underline",
        isActive ? "bg-brand-50 font-bold text-brand-600" : "font-semibold text-[#4a5a54] hover:bg-subtle")}>
      <Icon name={i.icon} size={18} />{i.label}
    </NavLink>
  );

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 px-4 py-6">
      <div className="px-2 pb-6"><Logo /></div>
      {items.map(link)}
      {canManage && (
        <NavLink to="/app/settings?tab=tools" className="mt-2 flex min-h-11 items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line-strong px-3 text-[14px] font-bold text-brand-600 no-underline">
          <Icon name="plus" size={18} />Add tools
        </NavLink>
      )}
      <div className="flex-1" />
      <button type="button" onClick={() => setAskOpen(true)} className="mb-1 flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-semibold text-[#4a5a54] hover:bg-subtle">
        <Icon name="spark" size={18} />Ask THUSO
      </button>
      {link({ to: "/app/settings", label: "Settings", icon: "settings" })}
      <div className="mt-2.5 flex items-center gap-2.5 border-t border-line px-2 pt-3.5">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-warn-50 text-[13px] font-extrabold text-warn-700">{initials(business.name)}</span>
        <div className="min-w-0 flex-1 text-[13px] leading-tight">
          <div className="truncate font-bold">{business.name}</div>
          <div className="capitalize text-muted">{role}</div>
        </div>
        <IconButton icon="logout" label="Sign out" onClick={() => logOut().then(() => nav("/"))} />
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)} style={{ background: "rgba(20,32,28,.45)" }}>
          <aside className="h-full w-[270px] bg-surface">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface px-3 py-2 lg:hidden">
          <IconButton icon="menu" label="Open menu" onClick={() => setMenuOpen(true)} />
          <div className="flex-1"><Logo /></div>
          <IconButton icon="spark" label="Ask THUSO" onClick={() => setAskOpen(true)} />
        </header>
        {!online && (
          <div role="status" className="no-print flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-semibold text-white">
            <Icon name="wifiOff" size={16} />You are offline. You can keep working; changes sync when you reconnect.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet context={{ actor }} />
        </main>
        <nav aria-label="Quick" className="no-print sticky bottom-0 z-30 grid border-t border-line bg-surface lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}>
          {items.slice(0, 5).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/app"}
              className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] no-underline", isActive ? "font-bold text-brand-600" : "font-semibold text-[#4a5a54]")}>
              <Icon name={i.icon} size={20} />{i.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}

/** Open the Ask THUSO panel from anywhere. */
export const openAsk = () => window.dispatchEvent(new Event("thuso:ask"));
