import { Shield, MapPin, PhoneCall, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-[#070A11]" data-testid="app-footer">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-12 grid gap-8 md:grid-cols-3 text-sm">
        {/* Col 1: Platform */}
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-cyan-400/20 border border-cyan-400/40 grid place-items-center">
              <Shield className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <span className="text-white font-bold text-base">Delhi SafeCity</span>
          </div>
          <p className="mt-3 text-slate-400 text-xs leading-relaxed">
            Public safety intelligence and safe route recommendation platform engineered strictly for the
            National Capital Territory (NCT) of Delhi. Spatial risk analytics, high-density police station directory,
            and emergency dispatch integration.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-400/30 text-[10px] font-mono text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            JURISDICTION: NCT OF DELHI ONLY
          </div>
        </div>

        {/* Col 2: Districts & Study Scope */}
        <div>
          <div className="eyebrow flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Jurisdiction Scope
          </div>
          <p className="mt-2 text-slate-200 font-semibold text-xs">11 NCT Delhi Districts</p>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            Central, New Delhi, North, South, South East, South West, East, West, North West, North East, and Shahdara.
          </p>
          <div className="mt-2 text-[11px] text-amber-300/90 font-mono">
            * Excludes NCR satellite towns (Noida, Gurugram, Ghaziabad, Faridabad).
          </div>
        </div>

        {/* Col 3: Emergency */}
        <div>
          <div className="eyebrow flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5" /> Delhi Emergency Dispatch
          </div>
          <div className="mt-2 text-slate-200 font-mono text-sm space-y-1">
            <div className="flex justify-between items-center border-b border-white/5 py-1">
              <span className="text-slate-400 text-xs">Delhi Police Emergency:</span>
              <span className="text-rose-400 font-bold">112</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/5 py-1">
              <span className="text-slate-400 text-xs">Women Helpline:</span>
              <span className="text-pink-400 font-bold">1091 / 181</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/5 py-1">
              <span className="text-slate-400 text-xs">Cyber Fraud (IFSO):</span>
              <span className="text-cyan-400 font-bold">1930</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400 text-xs">CATS Ambulance:</span>
              <span className="text-emerald-400 font-bold">102 / 108</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 py-4 px-4 text-center text-[11px] text-slate-500 font-mono">
        © 2026 · DELHI CRIME ANALYSIS, DETECTION &amp; SAFE ROUTE RECOMMENDATION PLATFORM · NCT OF DELHI
      </div>
    </footer>
  );
}
