import { Link } from "react-router-dom";
import {
  ArrowRight, Activity, MapPinned, ShieldAlert, Sparkles, Building2, PhoneCall,
  BarChart3, ChevronRight, Navigation
} from "lucide-react";

// Professional aerial cityscape banner
const AERIAL = "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=2000&q=80";

const features = [
  {
    icon: Navigation,
    title: "Safe Route Finder",
    body: "Multi-factor route comparison for NCT Delhi commuters based on street illumination, police presence, and historical risk scores.",
    to: "/safe-route",
    testId: "feat-saferoute",
    badge: "New"
  },
  {
    icon: Activity,
    title: "Delhi Crime Heatmap",
    body: "Spatial incident density overlay for NCT Delhi, mapped across municipal wards, arterial corridors, and high-footfall squares.",
    to: "/map",
    testId: "feat-heatmap",
    badge: "Live"
  },
  {
    icon: BarChart3,
    title: "Analytics Deck",
    body: "Hour-of-day, day-of-week, crime category distribution, and seasonality diagnostics generated dynamically from the analytics engine.",
    to: "/analytics",
    testId: "feat-analytics"
  },
  {
    icon: PhoneCall,
    title: "Emergency Dispatch",
    body: "One-tap direct dialing to Delhi Police (112), Women Helpline (1091 / 181), Cyber Fraud IFSO (1930), and CATS Ambulance (102).",
    to: "/emergency",
    testId: "feat-speeddial"
  },
  {
    icon: Building2,
    title: "Delhi Police Directory",
    body: "Haversine-computed nearest station lookup across all 11 Delhi Districts, complete with SHO and DCP zone contacts.",
    to: "/police-stations",
    testId: "feat-stations"
  },
  {
    icon: MapPinned,
    title: "Live GPS & Safe Corridor",
    body: "Real-time device geolocation anchored within NCT Delhi, with simulated arterial safe corridors and SOS logging to MongoDB.",
    to: "/map",
    testId: "feat-tracking"
  },
];

export default function Home() {
  return (
    <main data-testid="home-page">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 opacity-25"
          style={{ backgroundImage: `url(${AERIAL})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#060911] via-[#080D1A]/90 to-[#0A1020]/75" />
        <div className="absolute inset-0 dot-grid opacity-30" />

        <div className="relative mx-auto max-w-7xl px-4 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 text-xs font-mono uppercase tracking-widest mb-4" data-testid="hero-eyebrow">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              NCT of Delhi · Crime Analysis &amp; Safe Transit Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
              Delhi Urban Safety, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400">
                rendered in real time.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-slate-300 text-base sm:text-lg leading-relaxed">
              Spatial crime diagnostics and predictive safe route recommendations engineered strictly for the
              <strong> National Capital Territory (NCT) of Delhi</strong>. Compare safest transit corridors, inspect
              neighbourhood risk, and access 24/7 Delhi Police emergency services with zero guesswork.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/safe-route"
                data-testid="hero-open-saferoute"
                className="group inline-flex items-center gap-2 rounded-lg bg-emerald-400 text-slate-950 px-5 py-3 text-sm font-bold hover:bg-emerald-300 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)]"
              >
                <Navigation className="w-4 h-4" /> Plan Safe Route <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/map"
                data-testid="hero-open-map"
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 text-slate-950 px-5 py-3 text-sm font-semibold hover:bg-cyan-300 transition-colors shadow-[0_0_20px_rgba(0,229,255,0.25)]"
              >
                <Activity className="w-4 h-4" /> Explore Crime Map
              </Link>
              <Link
                to="/emergency"
                data-testid="hero-open-emergency"
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 text-rose-300 px-5 py-3 text-sm font-semibold hover:bg-rose-500/10 transition-colors"
              >
                <ShieldAlert className="w-4 h-4" /> Speed Dial (112)
              </Link>
            </div>
          </div>
        </div>

        {/* Real-time Reference Data Ticker (Delhi Localities) */}
        <div className="border-t border-white/10 bg-[#080D18]/90 py-3 text-xs font-mono overflow-x-auto whitespace-nowrap">
          <div className="mx-auto max-w-7xl px-4 lg:px-8 flex items-center gap-6 text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              DELHI NCT PATROL STATUS:
            </span>
            <span><strong className="text-cyan-300">CONNAUGHT PLACE</strong> central radius CCTV normal ·</span>
            <span><strong className="text-amber-300">HAUZ KHAS</strong> weekend footfall patrol deployed ·</span>
            <span><strong className="text-rose-300">CHANDNI CHOWK</strong> high-visibility night picket active ·</span>
            <span><strong className="text-emerald-300">DWARKA SEC 21</strong> metro interchange corridor steady ·</span>
            <span><strong className="text-cyan-300">ROHINI SEC 10</strong> arterial sector watch normal ·</span>
            <span><strong className="text-slate-300">LAJPAT NAGAR</strong> market transit line operational</span>
          </div>
        </div>
      </section>

      {/* 6 Specialised Views Grid */}
      <section className="mx-auto max-w-7xl px-4 lg:px-8 py-16">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-white">
              Six specialised views for Delhi safety
            </h2>
            <p className="mt-1.5 text-sm text-slate-400 max-w-xl">
              From calculating well-lit transit routes to locating the nearest Delhi Police thana, each module is engineered for real-world civic reliability.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <Link
              key={f.title}
              to={f.to}
              data-testid={f.testId}
              className="group rounded-xl border border-white/10 bg-[#0F1422] p-6 hover:border-cyan-400/40 hover:bg-[#111A2E] transition-all relative overflow-hidden shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-400/10 border border-cyan-400/30 grid place-items-center">
                    <f.icon className="w-5 h-5 text-cyan-300" />
                  </div>
                  <div className="flex items-center gap-2">
                    {f.badge && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 font-semibold">
                        {f.badge}
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-500 tracking-widest">
                      0{i + 1}
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-200 transition-colors">
                  {f.title}
                </h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  {f.body}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-white/5 flex items-center text-cyan-300 text-xs font-semibold">
                Open module <ChevronRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="mx-auto max-w-7xl px-4 lg:px-8 py-16 text-center border-t border-white/10">
        <div className="max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-cyan-400/15 border border-cyan-400/40 grid place-items-center mx-auto mb-4 shadow-[0_0_20px_rgba(0,229,255,0.25)]">
            <Sparkles className="w-6 h-6 text-cyan-300" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Start with your Delhi location.
          </h2>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed">
            Whether you are commuting late at night through Central Delhi or finding the safest pedestrian corridor to a Metro station, the platform dynamically centers on your coordinates.
          </p>
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <Link
              to="/safe-route"
              data-testid="cta-open-saferoute"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 text-slate-950 px-5 py-3 text-sm font-bold hover:bg-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
            >
              <Navigation className="w-4 h-4" /> Try Safe Route Finder
            </Link>
            <Link
              to="/map"
              data-testid="cta-open-map"
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 text-slate-950 px-5 py-3 text-sm font-semibold hover:bg-cyan-300 transition-colors"
            >
              Enter Crime Map <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
