import { useEffect, useState, useMemo } from "react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import {
  Siren, ShieldAlert, PhoneCall, Ambulance, Flame, HeartHandshake, Shield, UserRound,
  Baby, Smile, Gavel, Map, Copy, Check, Filter
} from "lucide-react";
import { DELHI_HELPLINES } from "../constants/delhiData";

const ICONS = {
  "shield-alert": ShieldAlert,
  siren: Siren,
  "user-round": UserRound,
  "heart-handshake": HeartHandshake,
  ambulance: Ambulance,
  baby: Baby,
  flame: Flame,
  smile: Smile,
  shield: Shield,
  gavel: Gavel,
  map: Map,
  "phone-call": PhoneCall,
};

const COLOR_TOKEN = {
  danger: { border: "border-rose-400/40", text: "text-rose-300", bg: "bg-rose-500/10", glow: "hover:border-rose-400" },
  pink: { border: "border-pink-400/40", text: "text-pink-300", bg: "bg-pink-500/10", glow: "hover:border-pink-400" },
  green: { border: "border-emerald-400/40", text: "text-emerald-300", bg: "bg-emerald-500/10", glow: "hover:border-emerald-400" },
  amber: { border: "border-amber-400/40", text: "text-amber-300", bg: "bg-amber-500/10", glow: "hover:border-amber-400" },
  cyan: { border: "border-cyan-400/40", text: "text-cyan-300", bg: "bg-cyan-500/10", glow: "hover:border-cyan-400" },
};

export default function Emergency() {
  const [helplines, setHelplines] = useState(DELHI_HELPLINES);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [copiedNum, setCopiedNum] = useState(null);

  useEffect(() => {
    endpoints.helplines()
      .then((d) => {
        // If backend helplines are available, merge; otherwise use verified Delhi helplines
        if (d.helplines?.length && d.helplines[0].number === "112") {
          setHelplines(d.helplines);
        } else {
          setHelplines(DELHI_HELPLINES);
        }
      })
      .catch(() => {
        setHelplines(DELHI_HELPLINES);
      });
  }, []);

  const copy = (num) => {
    navigator.clipboard.writeText(num);
    setCopiedNum(num);
    toast.success(`Helpline ${num} copied to clipboard.`);
    setTimeout(() => setCopiedNum(null), 2500);
  };

  const log = (h) => {
    endpoints.sos({
      kind: "delhi_helpline_dialled",
      detail: `Citizen dialled ${h.name} (${h.number})`,
      helpline: h.number
    }).catch(() => {});
  };

  const categories = useMemo(() => {
    const set = new Set(DELHI_HELPLINES.map((h) => h.category));
    return ["All", ...Array.from(set)];
  }, []);

  const filteredHelplines = useMemo(() => {
    if (selectedCategory === "All") return helplines;
    return helplines.filter((h) => h.category === selectedCategory);
  }, [helplines, selectedCategory]);

  return (
    <main className="mx-auto max-w-7xl px-4 lg:px-8 py-10" data-testid="emergency-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
            04 / rapid dispatch
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Delhi Emergency Speed Dial
          </h1>
          <p className="mt-2 text-slate-400 text-sm max-w-2xl">
            Official 24x7 emergency response contacts for the <strong>National Capital Territory (NCT) of Delhi</strong>.
            Tap any number to dial immediately on mobile devices or copy to your dialer.
          </p>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0F1422] border border-white/10 text-xs text-rose-300 font-mono">
          <Siren className="w-4 h-4 text-rose-400 animate-pulse" />
          <span>Delhi Police Dispatch: 112 Active</span>
        </div>
      </div>

      {/* Category Pills */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? "bg-cyan-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(0,229,255,0.3)]"
                : "border border-white/10 bg-[#0F1422] text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Helplines Grid */}
      <div className="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredHelplines.map((h) => {
          const Icon = ICONS[h.icon] || Shield;
          const c = COLOR_TOKEN[h.color] || COLOR_TOKEN.cyan;
          return (
            <div
              key={h.id}
              data-testid={`speed-dial-${h.id}`}
              className={`rounded-2xl border ${c.border} bg-[#0F1422] p-5 relative overflow-hidden transition-all hover:bg-[#111A2E] shadow-lg flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl ${c.bg} border ${c.border} grid place-items-center relative`}>
                    <Icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <div className={`font-mono text-3xl sm:text-4xl font-extrabold ${c.text} tracking-tight`}>
                    {h.number}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{h.category}</div>
                  <div className="text-white font-bold text-base mt-0.5">{h.name}</div>
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">{h.description}</div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/5 flex gap-2">
                <a
                  href={`tel:${h.number}`}
                  onClick={() => log(h)}
                  data-testid={`call-${h.id}`}
                  className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg ${c.bg} ${c.text} border ${c.border} py-2 text-xs font-bold hover:bg-white/10 transition-colors`}
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Call {h.number}
                </a>
                <button
                  onClick={() => copy(h.number)}
                  data-testid={`copy-${h.id}`}
                  className="rounded-lg border border-white/15 px-3 py-2 text-slate-300 hover:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Copy helpline number"
                  title="Copy number"
                >
                  {copiedNum === h.number ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Advisory Banner */}
      <div className="mt-10 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-xs sm:text-sm text-amber-200 flex gap-3 leading-relaxed">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
        <div>
          <strong>Delhi NCT Jurisdiction Protocol:</strong> All emergency helplines listed connect directly to authorized
          Delhi Government and Delhi Police centralized control centers. In cases of cross-border pursuit near Haryana or Uttar Pradesh
          borders, Delhi Police ERSS-112 coordinates automatic inter-state control room handshakes.
        </div>
      </div>
    </main>
  );
}
