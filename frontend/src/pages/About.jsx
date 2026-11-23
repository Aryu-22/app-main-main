import { BookOpen, Database, Cpu, GitBranch, LineChart, Lock, MapPin, Users, Shield, Navigation, AlertCircle } from "lucide-react";
import { DELHI_DISTRICTS } from "../constants/delhiData";

const stack = [
  { label: "Backend Service", tech: "FastAPI · Motor · Uvicorn" },
  { label: "Frontend Architecture", tech: "React 19 · Tailwind CSS · Vite/CRA" },
  { label: "Cartography", tech: "Leaflet · OpenStreetMap · leaflet.heat" },
  { label: "Analytics Deck", tech: "Recharts (Composable SVG Charts)" },
  { label: "Persistence", tech: "MongoDB (GPS Trails & SOS Events)" },
  { label: "Route Optimizer", tech: "Multi-Criteria Spatial Safety Engine" },
];

const objectives = [
  "Ingest and normalize comprehensive geo-tagged crime and incident records for the National Capital Territory (NCT) of Delhi.",
  "Model neighborhood safety profiles via spatio-temporal clustering over latitude, longitude, diurnal hour, and population density.",
  "Deliver a multi-factor Safe Route Finder that balances travel time, street lighting coverage, and proximity to Delhi Police booths.",
  "Maintain an authenticated directory of verified Delhi Police stations across all 11 revenue and police districts with SHO/DCP contacts.",
  "Integrate unified emergency dispatch shortcuts (112, 1091, 181, 1930) with real-time GPS telemetry and MongoDB logging."
];

export default function About() {
  return (
    <main className="mx-auto max-w-6xl px-4 lg:px-8 py-12" data-testid="about-page">
      {/* Header */}
      <div className="eyebrow flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-cyan-400" />
        06 / research &amp; platform architecture
      </div>
      <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
        Delhi Crime Intelligence &amp; Safe Route Platform
      </h1>
      <p className="mt-3 text-slate-300 max-w-3xl text-base leading-relaxed">
        System architecture, spatial risk diagnostics, data governance framework, and ethical safeguards engineered
        strictly for the <strong>National Capital Territory (NCT) of Delhi</strong>.
      </p>

      {/* Abstract */}
      <section className="mt-10 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl" data-testid="section-abstract">
        <div className="flex items-center gap-2 eyebrow"><BookOpen className="w-3.5 h-3.5 text-cyan-400" /> Executive Abstract</div>
        <p className="mt-3 text-slate-200 leading-relaxed text-sm">
          <b>Delhi SafeCity Intelligence</b> is an urban safety analytics and civic transit platform designed to empower citizens,
          commuters, and municipal authorities across Delhi's 11 districts. By harmonizing spatial incident distributions with
          real-time telemetry and infrastructure indices (such as LED illumination and Delhi Police checkpoint density), the platform
          recommends transit corridors optimized for safety rather than purely speed.
          Built as a modern, production-ready full-stack application, it combines a React 19 interface, a high-throughput
          FastAPI service layer, MongoDB session persistence, and lightweight Leaflet mapping.
        </p>
      </section>

      {/* Distinction & Ingestion Status */}
      <section className="mt-6 rounded-2xl border border-cyan-400/30 bg-[#0B1528] p-6 shadow-xl">
        <div className="flex items-center gap-2 eyebrow text-cyan-300">
          <Database className="w-3.5 h-3.5 text-cyan-400" /> Data Governance &amp; Ingestion Roadmap
        </div>
        <h2 className="text-xl font-bold text-white mt-2">
          Dual-Tier Spatial Architecture: Historical Data vs. Predictive Risk
        </h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
          <div className="p-4 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-cyan-300 font-bold text-sm mb-1">Tier 1: Historical Incident Pipeline (Active)</div>
            <p className="text-slate-400">
              Serves aggregated incident distributions across temporal slices (diurnal hour, weekday vs weekend, category breakdown).
              Fully integrated with the live FastAPI REST endpoints.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-emerald-300 font-bold text-sm mb-1">Tier 2: Delhi ML Predictive Model (Step 2 Ingestion)</div>
            <p className="text-slate-400">
              The spatio-temporal cluster centroids and ward-level risk coefficients will be updated in subsequent deployment steps
              upon ingestion of the dedicated Delhi municipal dataset.
            </p>
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl" data-testid="section-objectives">
        <div className="flex items-center gap-2 eyebrow"><GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Platform Objectives</div>
        <ul className="mt-4 space-y-2.5 text-sm text-slate-200">
          {objectives.map((o, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="font-mono text-cyan-300 text-xs pt-0.5 bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20">
                O{String(i + 1).padStart(2, "0")}
              </span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Safe Route Finder Methodology */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl">
        <div className="flex items-center gap-2 eyebrow"><Navigation className="w-3.5 h-3.5 text-emerald-400" /> Safe Route Engine</div>
        <h2 className="text-lg font-bold text-white mt-1.5">Multi-Criteria Corridor Evaluation</h2>
        <p className="mt-2 text-slate-300 text-sm leading-relaxed">
          Unlike standard consumer navigation apps that focus exclusively on shortest time or distance, the Delhi Safe Route Finder
          computes a composite <strong>Safety Index (0–100)</strong> based on four weighted dimensions:
        </p>
        <div className="grid sm:grid-cols-4 gap-3 mt-4 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-cyan-300 font-bold">1. Patrol Density (30%)</div>
            <div className="text-slate-400 mt-1">Proximity to Delhi Police booths and PCR routes</div>
          </div>
          <div className="p-3 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-emerald-300 font-bold">2. Illumination (25%)</div>
            <div className="text-slate-400 mt-1">Municipal smart streetlight grid coverage</div>
          </div>
          <div className="p-3 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-amber-300 font-bold">3. Historical Density (25%)</div>
            <div className="text-slate-400 mt-1">Incident frequency within 250m corridor buffer</div>
          </div>
          <div className="p-3 rounded-xl bg-[#070A11] border border-white/5">
            <div className="text-indigo-300 font-bold">4. Transit Shield (20%)</div>
            <div className="text-slate-400 mt-1">DMRC Metro station alignment and CISF zones</div>
          </div>
        </div>
      </section>

      {/* Jurisdiction Coverage */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl" data-testid="section-coverage">
        <div className="flex items-center gap-2 eyebrow"><MapPin className="w-3.5 h-3.5 text-rose-400" /> Strict NCT Delhi Jurisdiction</div>
        <p className="mt-2 text-slate-300 text-sm leading-relaxed">
          The application is strictly restricted to the <strong>National Capital Territory (NCT) of Delhi</strong>.
          Satellite NCR municipalities (such as Noida, Greater Noida, Ghaziabad, Gurugram, and Faridabad) fall under Haryana
          and Uttar Pradesh state police jurisdictions and are intentionally excluded to maintain regulatory and operational fidelity.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-4 text-xs font-mono">
          {DELHI_DISTRICTS.map((d) => (
            <div key={d.id} className="p-2.5 rounded-lg border border-white/10 bg-[#070A11]">
              <div className="text-slate-100 font-semibold">{d.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">HQ: {d.hq}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Stack Grid */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl" data-testid="section-stack">
        <div className="flex items-center gap-2 eyebrow"><LineChart className="w-3.5 h-3.5 text-cyan-400" /> Production Tech Stack</div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mt-4 text-xs">
          {stack.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-[#070A11] p-3">
              <div className="text-slate-500 uppercase tracking-widest text-[10px] font-mono">{s.label}</div>
              <div className="text-slate-100 font-semibold mt-1">{s.tech}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Ethics & Safeguards */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0F1422] p-6 shadow-xl" data-testid="section-ethics">
        <div className="flex items-center gap-2 eyebrow"><Lock className="w-3.5 h-3.5 text-amber-400" /> Ethical Safeguards &amp; Privacy</div>
        <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <li>· <b>Civic Safety Solely:</b> Risk scores describe spatial-temporal density for transit planning and must never be utilized for demographic profiling.</li>
          <li>· <b>Telemetry Privacy:</b> Live GPS coordinates are processed locally on device; optional session trails are keyed to anonymous identifiers and can be flushed upon request.</li>
          <li>· <b>Official Police Escalation:</b> The platform serves as civic decision support; in active emergency scenarios, users should immediately trigger the 112 Speed Dial.</li>
        </ul>
      </section>
    </main>
  );
}
