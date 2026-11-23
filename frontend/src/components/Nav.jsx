import { NavLink, Link } from "react-router-dom";
import {
  Shield, Map, BarChart3, PhoneCall, Building2, Menu, X, Navigation, Info, ShieldAlert
} from "lucide-react";
import { useState } from "react";

const links = [
  { to: "/", label: "Dashboard", icon: Shield, testId: "nav-home" },
  { to: "/safe-route", label: "Safe Route", icon: Navigation, testId: "nav-safe-route" },
  { to: "/map", label: "Crime Map", icon: Map, testId: "nav-map" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, testId: "nav-analytics" },
  { to: "/emergency", label: "Speed Dial", icon: PhoneCall, testId: "nav-emergency" },
  { to: "/police-stations", label: "Stations", icon: Building2, testId: "nav-stations" },
  { to: "/about", label: "About", icon: Info, testId: "nav-about" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 backdrop-blur-md bg-[#0A0D14]/90" data-testid="app-header">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 flex items-center h-16 gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 border border-cyan-400/40 grid place-items-center relative shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            <Shield className="w-4 h-4 text-cyan-300" strokeWidth={2.3} />
            <span className="absolute -bottom-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse ring-2 ring-[#0A0D14]" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] tracking-[0.24em] text-emerald-400 font-mono uppercase font-semibold">
              DELHI — NCT
            </div>
            <div className="text-sm font-extrabold text-white tracking-tight">
              Delhi SafeCity <span className="text-cyan-400 text-xs font-mono font-normal">Intelligence</span>
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="ml-auto hidden lg:flex items-center gap-1">
          {links.map(({ to, label, icon: Icon, testId }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testId}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}

          {/* Quick SOS Trigger in Nav */}
          <Link
            to="/emergency"
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)]"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            SOS (112)
          </Link>

          {/* Jurisdiction Indicator */}
          <span className="hidden xl:flex items-center gap-1 font-mono text-[10px] text-slate-400 pl-3 border-l border-white/10 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            NCT ONLY
          </span>
        </nav>

        {/* Mobile menu trigger */}
        <button
          className="lg:hidden ml-auto p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          onClick={() => setOpen((v) => !v)}
          data-testid="mobile-menu-toggle"
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="lg:hidden border-t border-white/10 px-4 py-4 grid gap-1.5 bg-[#070A11]/98 backdrop-blur-xl animate-in slide-in-from-top-2">
          {links.map(({ to, label, icon: Icon, testId }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
              data-testid={`mobile-${testId}`}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 ${
                  isActive
                    ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30 font-semibold"
                    : "text-slate-300 hover:bg-white/5"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}

          <div className="mt-2 pt-3 border-t border-white/10">
            <Link
              to="/emergency"
              onClick={() => setOpen(false)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-400/40 text-xs font-bold"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Delhi Police Emergency Speed Dial (112)
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
