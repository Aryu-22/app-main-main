import { useEffect, useState, useMemo } from "react";
import { endpoints } from "../lib/api";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Building2, PhoneCall, Locate, ShieldCheck, MapPin, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import {
  DELHI_CENTER, DELHI_BOUNDS, isWithinDelhi, DELHI_POLICE_STATIONS, DELHI_DISTRICTS
} from "../constants/delhiData";

const stationIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:6px;background:#10B981;border:2px solid #0A0D14;display:flex;align-items:center;justify-content:center;color:#0A0D14;font-weight:700;font-size:12px;box-shadow:0 4px 10px rgba(0,0,0,0.4)">P</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#00E5FF;border:3px solid #0A0D14;box-shadow:0 0 0 3px rgba(0,229,255,0.3)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapPan({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.setView([target.lat, target.lng], 14, { animate: true });
    }
  }, [target, map]);
  return null;
}

// Calculate Haversine distance
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export default function Stations() {
  const [stations, setStations] = useState(DELHI_POLICE_STATIONS);
  const [pos, setPos] = useState(null);
  const [selected, setSelected] = useState(DELHI_POLICE_STATIONS[0]);
  const [selectedDistrict, setSelectedDistrict] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const load = (userLat, userLng) => {
    endpoints.stations(userLat, userLng)
      .then((d) => {
        let baseList = DELHI_POLICE_STATIONS;
        const backendStations = (d.stations || []).filter((s) => isWithinDelhi(s.lat, s.lng));
        if (backendStations.length > 0) {
          baseList = backendStations;
        }

        if (userLat && userLng) {
          const sorted = baseList
            .map((s) => ({
              ...s,
              distance_km: calcDistance(userLat, userLng, s.lat, s.lng),
            }))
            .sort((a, b) => a.distance_km - b.distance_km);
          setStations(sorted);
          setSelected(sorted[0]);
        } else {
          setStations(baseList);
          setSelected((prev) => prev || baseList[0]);
        }
      })
      .catch(() => {
        if (userLat && userLng) {
          const sorted = DELHI_POLICE_STATIONS
            .map((s) => ({
              ...s,
              distance_km: calcDistance(userLat, userLng, s.lat, s.lng),
            }))
            .sort((a, b) => a.distance_km - b.distance_km);
          setStations(sorted);
          setSelected(sorted[0]);
        } else {
          setStations(DELHI_POLICE_STATIONS);
          setSelected(DELHI_POLICE_STATIONS[0]);
        }
      });
  };

  useEffect(() => {
    load();
  }, []);

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation unsupported by device.");
      return;
    }
    toast.message("Requesting your location coordinates…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        if (!isWithinDelhi(lat, lng)) {
          toast.warning("Detected position is outside NCT of Delhi. Calculating distance from Connaught Place.");
          const cp = { lat: DELHI_CENTER.lat, lng: DELHI_CENTER.lng };
          setPos(cp);
          load(cp.lat, cp.lng);
          return;
        }
        const loc = { lat, lng };
        setPos(loc);
        load(loc.lat, loc.lng);
        toast.success("Stations sorted by distance from your location.");
      },
      () => {
        toast.warning("GPS access denied. Sorting from Central Delhi (Connaught Place).");
        const cp = { lat: DELHI_CENTER.lat, lng: DELHI_CENTER.lng };
        setPos(cp);
        load(cp.lat, cp.lng);
      }
    );
  };

  // Filtered stations
  const filteredStations = useMemo(() => {
    return stations.filter((s) => {
      const matchDistrict =
        selectedDistrict === "All" ||
        s.zone?.toLowerCase().includes(selectedDistrict.toLowerCase());
      const matchSearch =
        !searchTerm.trim() ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.zone.toLowerCase().includes(searchTerm.toLowerCase());
      return matchDistrict && matchSearch;
    });
  }, [stations, selectedDistrict, searchTerm]);

  return (
    <main className="mx-auto max-w-7xl px-4 lg:px-8 py-10" data-testid="stations-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            05 / police directory
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Delhi Police Stations Directory
          </h1>
          <p className="mt-2 text-slate-400 text-sm max-w-xl">
            Verified station headquarters, SHO contacts, and emergency lines across all 11 Districts of the
            <strong> National Capital Territory (NCT) of Delhi</strong>.
          </p>
        </div>

        <button
          onClick={locateMe}
          data-testid="btn-locate-me"
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 text-slate-950 px-4 py-2.5 text-sm font-bold hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(0,229,255,0.25)]"
        >
          <Locate className="w-4 h-4" /> Sort by Distance from Me
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search station by name, road, or zone (e.g. Connaught Place, Hauz Khas)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#0F1422] pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="rounded-lg border border-white/15 bg-[#0F1422] px-3 py-2.5 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
          >
            <option value="All">All 11 Delhi Districts</option>
            {DELHI_DISTRICTS.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5 mt-6">
        {/* Left: Station Cards List */}
        <div className="lg:col-span-5 space-y-3 max-h-[68vh] overflow-y-auto pr-2 custom-scrollbar">
          {filteredStations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm border border-white/10 rounded-xl bg-[#0F1422]">
              No Delhi police stations found matching your filter criteria.
            </div>
          ) : (
            filteredStations.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                data-testid={`station-card-${s.id}`}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  selected?.id === s.id
                    ? "border-cyan-400/60 bg-[#0F172A] shadow-[0_0_15px_rgba(0,229,255,0.15)] ring-1 ring-cyan-400/40"
                    : "border-white/10 bg-[#0F1422] hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-300" /> {s.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {s.zone} · {s.address}
                    </div>
                  </div>
                  {s.distance_km != null && (
                    <span className="font-mono text-cyan-300 text-xs bg-cyan-400/10 border border-cyan-400/30 rounded-md px-2 py-0.5 whitespace-nowrap">
                      {s.distance_km} km
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/5 text-[11px] font-mono text-slate-400">
                  <div>
                    Phone: <span className="text-slate-200">{s.phone}</span>
                  </div>
                  <div className="truncate">
                    SHO: <span className="text-slate-200">{s.sho_name}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: Map & Selected Detail */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl overflow-hidden border border-white/10 relative shadow-xl">
            <MapContainer
              center={[selected?.lat || DELHI_CENTER.lat, selected?.lng || DELHI_CENTER.lng]}
              zoom={13}
              maxBounds={DELHI_BOUNDS}
              minZoom={10}
              scrollWheelZoom
              style={{ height: "45vh", minHeight: 320 }}
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors | NCT of Delhi'
              />

              {filteredStations.map((s) => (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={stationIcon}>
                  <Popup>
                    <div className="font-sans text-xs">
                      <b>{s.name}</b>
                      <div>{s.address}</div>
                      <div>{s.phone}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {pos && (
                <Marker position={[pos.lat, pos.lng]} icon={userIcon}>
                  <Popup>Your Location</Popup>
                </Marker>
              )}

              <MapPan target={selected} />
            </MapContainer>
          </div>

          {/* Selected Station Deep Details */}
          {selected && (
            <div className="rounded-2xl border border-white/10 bg-[#0F1422] p-5 shadow-lg space-y-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">
                    {selected.zone} District Command
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1.5">{selected.name}</h3>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selected.address}</span>
                  </div>
                </div>

                <a
                  href={`tel:${selected.phone}`}
                  data-testid="selected-station-call"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 text-slate-950 px-4 py-2 text-xs font-bold hover:bg-emerald-300 transition-colors shadow-md"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Call {selected.phone}
                </a>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-white/5 text-xs">
                <div className="rounded-lg bg-[#070A11] p-3 border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Station House Officer (SHO)</div>
                  <div className="text-slate-100 font-semibold mt-1">{selected.sho_name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Direct station operational supervision</div>
                </div>

                <div className="rounded-lg bg-[#070A11] p-3 border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-slate-500">District Leadership (DCP / SP)</div>
                  <div className="text-slate-100 font-semibold mt-1">{selected.sp_head}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">District Command &amp; Public Grievances</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
