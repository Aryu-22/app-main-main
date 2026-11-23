import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  Crosshair,
  Info,
  LoaderCircle,
  MapPin,
  Search,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { DELHI_BOUNDS, DELHI_CENTER, DELHI_LANDMARKS, isWithinDelhi } from "../constants/delhiData";
import { endpoints } from "../lib/api";
import "./CrimeMap.css";

const ZONE_STYLES = {
  Green: { fillColor: "#16a36a", color: "#128253" },
  Yellow: { fillColor: "#e8ac36", color: "#bd8420" },
  Red: { fillColor: "#dc6262", color: "#bb4747" },
};

const selectedIcon = L.divIcon({
  className: "crime-map-leaflet-icon",
  html: '<span class="crime-map-pin"><span></span></span>',
  iconSize: [26, 34],
  iconAnchor: [13, 30],
});

function DelhiMapEvents({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        label: "Selected map location",
      });
    },
  });
  return null;
}

function MapFocus({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [location, map]);
  return null;
}

function toDelhiLocalInput(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function toDelhiIso(value) {
  return `${value}:00+05:30`;
}

export default function CrimeMap() {
  const [zones, setZones] = useState([]);
  const [zonesStatus, setZonesStatus] = useState("loading");
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [selectedTime, setSelectedTime] = useState(() => toDelhiLocalInput(new Date()));
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mapError, setMapError] = useState("");

  const landmarkMatches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length < 2) return [];
    return DELHI_LANDMARKS.filter((landmark) => (
      landmark.name.toLowerCase().includes(value)
      || landmark.district.toLowerCase().includes(value)
    )).slice(0, 4);
  }, [query]);

  const selectLocation = useCallback((location) => {
    if (!isWithinDelhi(location.lat, location.lng)) {
      setMapError("Choose a location within the National Capital Territory of Delhi.");
      return;
    }
    setMapError("");
    setAnalysis(null);
    setSelected(location);
  }, []);

  useEffect(() => {
    let active = true;
    setZonesStatus("loading");
    endpoints.crimeZones(toDelhiIso(selectedTime))
      .then((response) => {
        if (!active) return;
        setZones(response.zones || []);
        setZonesStatus(response.status === "ok" ? "ready" : "insufficient");
      })
      .catch(() => {
        if (!active) return;
        setZonesStatus("error");
      });
    return () => { active = false; };
  }, [selectedTime]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    setAnalysisStatus("loading");
    endpoints.locationAnalysis(selected.lat, selected.lng, toDelhiIso(selectedTime))
      .then((response) => {
        if (!active) return;
        setAnalysis(response);
        setAnalysisStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setAnalysisStatus("error");
        setAnalysis(null);
        setMapError(error.response?.data?.detail || "Safety analysis is temporarily unavailable.");
      });
    return () => { active = false; };
  }, [selected, selectedTime]);

  const searchLocation = async (value = query) => {
    const searchTerm = value.trim();
    if (!searchTerm) return;
    setSearching(true);
    setSearchError("");
    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        limit: "5",
        countrycodes: "in",
        bounded: "1",
        viewbox: "76.8388351,28.8834464,77.3453379,28.4046285",
        q: `${searchTerm}, Delhi, India`,
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      if (!response.ok) throw new Error("Location search could not be completed.");
      const results = await response.json();
      const result = results.find((item) => isWithinDelhi(Number(item.lat), Number(item.lon)));
      if (!result) {
        setSearchError("No matching location found within Delhi NCT.");
        return;
      }
      selectLocation({
        lat: Number(result.lat),
        lng: Number(result.lon),
        label: result.display_name,
      });
      setQuery(result.display_name.split(",").slice(0, 2).join(","));
    } catch (error) {
      setSearchError(error.message || "Location search is unavailable. Try again.");
    } finally {
      setSearching(false);
    }
  };

  const chooseLandmark = (landmark) => {
    setQuery(landmark.name);
    setSearchError("");
    selectLocation({ lat: landmark.lat, lng: landmark.lng, label: landmark.name });
  };

  const jumpToMyArea = () => {
    if (!navigator.geolocation) {
      setMapError("Location access is not available in this browser.");
      return;
    }
    setMapError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => selectLocation({
        lat: coords.latitude,
        lng: coords.longitude,
        label: "Your location",
      }),
      () => setMapError("Could not access your location. Check browser permissions and try again."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const result = analysis || {};
  const categories = result.other_crime_categories || [];
  const crimeProbability = result.crime_probability || {};
  const dataCoverage = result.data_coverage || {};
  const modelValidation = result.model_validation || {};
  const predictionSource = result.estimate_label
    || (result.prediction_source ? result.prediction_source.replace(/_/g, " ") : "");
  const zoneClass = (result.safety_zone || "").toLowerCase();
  const locationName = result.selected_location?.area_name;
  const displayName = locationName && locationName !== "Insufficient Data"
    ? locationName
    : selected?.label || "Selected location";

  return (
    <main className="crime-map-page">
      <div className="crime-map-shell">
        <div className="crime-map-heading">
          <div>
            <div className="crime-map-kicker"><span className="crime-map-live-dot" /> DELHI NCT · LOCATION SAFETY</div>
            <h1>Crime map</h1>
            <p>Explore historical safety patterns across Delhi. Select any point for a local analysis.</p>
          </div>
          <div className="crime-map-jurisdiction"><Shield size={15} /> Delhi NCT only</div>
        </div>

        <div className="crime-map-layout">
          <section className="crime-map-canvas" aria-label="Interactive crime map of Delhi">
            <div className="crime-map-search-wrap">
              <form
                className="crime-map-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  searchLocation();
                }}
              >
                <Search size={18} aria-hidden="true" />
                <input
                  aria-label="Search a Delhi location"
                  placeholder="Search a Delhi area or address"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchError("");
                  }}
                />
                {query && (
                  <button type="button" className="crime-map-clear" onClick={() => setQuery("")} aria-label="Clear search">
                    ×
                  </button>
                )}
                <button className="crime-map-search-button" type="submit" disabled={searching || !query.trim()}>
                  {searching ? <LoaderCircle size={16} className="crime-map-spin" /> : <span>Search</span>}
                </button>
              </form>
              {landmarkMatches.length > 0 && (
                <div className="crime-map-suggestions">
                  {landmarkMatches.map((landmark) => (
                    <button key={landmark.id} type="button" onClick={() => chooseLandmark(landmark)}>
                      <MapPin size={15} />
                      <span>{landmark.name}<small>{landmark.district}</small></span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              )}
              {searchError && <p className="crime-map-inline-error"><AlertCircle size={14} />{searchError}</p>}
            </div>

            <button type="button" className="crime-map-locate" onClick={jumpToMyArea} aria-label="Use my current location">
              <Crosshair size={18} />
            </button>

            <MapContainer
              center={[DELHI_CENTER.lat, DELHI_CENTER.lng]}
              zoom={11}
              minZoom={10}
              maxZoom={18}
              maxBounds={DELHI_BOUNDS}
              maxBoundsViscosity={0.85}
              scrollWheelZoom
              className="crime-map-leaflet"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {zones.map((zone) => {
                const style = ZONE_STYLES[zone.safety_zone];
                if (!style) return null;
                return (
                  <Rectangle
                    key={`${zone.bounds[0][0]}-${zone.bounds[0][1]}`}
                    bounds={zone.bounds}
                    pathOptions={{ ...style, weight: 0.7, fillOpacity: 0.28, opacity: 0.72 }}
                    interactive={false}
                  />
                );
              })}
              {selected && <Marker position={[selected.lat, selected.lng]} icon={selectedIcon} />}
              <DelhiMapEvents onSelect={selectLocation} />
              <MapFocus location={selected} />
            </MapContainer>

            <div className="crime-map-legend" aria-label="Safety zone legend">
              <span className="crime-map-legend-label">SAFETY ZONES</span>
              {[
                ["Green", "#16a36a", "Lower"],
                ["Yellow", "#e8ac36", "Moderate"],
                ["Red", "#dc6262", "Higher"],
              ].map(([label, color, hint]) => (
                <span key={label} className="crime-map-legend-item">
                  <i style={{ backgroundColor: color }} />{label}<small>{hint}</small>
                </span>
              ))}
            </div>

            <div className="crime-map-credit">Research/demo estimates · selected time · synthetic Delhi data</div>
            {zonesStatus === "loading" && (
              <div className="crime-map-map-status"><LoaderCircle size={15} className="crime-map-spin" /> Estimating the Delhi research grid</div>
            )}
            {zonesStatus === "error" && (
              <div className="crime-map-map-status crime-map-map-status-error"><AlertCircle size={15} /> Safety zones unavailable</div>
            )}
            {zonesStatus === "insufficient" && (
              <div className="crime-map-map-status crime-map-map-status-error"><Info size={15} /> Research grid estimates are unavailable</div>
            )}
          </section>

          <aside className="crime-map-panel" aria-live="polite">
            <div className="crime-map-panel-heading">
              <div>
                <div className="crime-map-panel-eyebrow"><MapPin size={14} /> LOCATION ANALYSIS</div>
                <h2>{selected ? displayName : "Select a location"}</h2>
                {selected && (
                  <p className="crime-map-coordinates">
                    {selected.lat.toFixed(5)}° N, {selected.lng.toFixed(5)}° E
                  </p>
                )}
              </div>
              {selected && result.safety_zone && result.safety_zone !== "Insufficient Data" && (
                <span className={`crime-map-zone-pill ${zoneClass}`}><i />{result.safety_zone} zone</span>
              )}
            </div>

            <label className="crime-map-time-select">
              <CalendarClock size={16} />
              <span>Analysis time</span>
              <input
                type="datetime-local"
                value={selectedTime}
                onChange={(event) => setSelectedTime(event.target.value || toDelhiLocalInput(new Date()))}
                aria-label="Select analysis date and time in Delhi"
              />
              <ChevronDown size={15} className="crime-map-time-chevron" />
            </label>
            <div className="crime-map-timezone">Times are interpreted in India Standard Time (IST).</div>

            {!selected && (
              <div className="crime-map-empty">
                <div className="crime-map-empty-icon"><MapPin size={23} /></div>
                <h3>Choose a place on the map</h3>
                <p>Search a Delhi locality or address, or click any point in the NCT to view its safety details.</p>
              </div>
            )}

            {selected && analysisStatus === "loading" && (
              <div className="crime-map-loading"><LoaderCircle size={22} className="crime-map-spin" /><span>Calculating an experimental location estimate…</span></div>
            )}

            {selected && analysisStatus === "error" && (
              <div className="crime-map-error-card"><AlertCircle size={18} /><div><strong>Analysis unavailable</strong><p>{mapError || "The backend could not return location details."}</p></div></div>
            )}

            {selected && analysisStatus === "ready" && (
              <>
                {result.crime_risk_level === "Insufficient Data" ? (
                  <div className="crime-map-insufficient"><Info size={18} /><div><strong>Insufficient Data</strong><p>{crimeProbability.message || "Location coverage or model validation is insufficient for a reliable estimate."}</p></div></div>
                ) : (
                  <div className={`crime-map-risk-card ${zoneClass}`}>
                    <div className="crime-map-risk-icon"><ShieldAlert size={20} /></div>
                    <div><span>RECORDED-CRIME RISK</span><strong>{result.crime_risk_level}</strong></div>
                    <span className="crime-map-risk-score">{crimeProbability.percentage}% <small>estimate</small></span>
                  </div>
                )}

                <section className="crime-map-probability">
                  <div className="crime-map-section-title">
                    <span>PROBABILITY OF A RECORDED CRIME</span>
                    <Info size={15} title="Experimental model estimate, not a verified real-world crime probability." />
                  </div>
                  <div className="crime-map-probability-value">
                    {crimeProbability.status === "ok" ? `${crimeProbability.percentage}%` : "Insufficient Data"}
                  </div>
                  <p>{crimeProbability.message}</p>
                  {modelValidation.deployment_ready && (
                    <p className="crime-map-model-quality">
                      {modelValidation.selected_model === "xgboost" ? "XGBoost" : "Random Forest"} · Test ROC-AUC {Number(modelValidation.test_metrics?.roc_auc).toFixed(2)} · Brier {Number(modelValidation.test_metrics?.brier_score).toFixed(3)}
                    </p>
                  )}
                  {crimeProbability.status === "ok" && predictionSource && (
                    <p className="crime-map-model-quality">
                      Estimate basis: {predictionSource}
                      {result.fallback_used ? " · fallback used" : ""}
                    </p>
                  )}
                </section>

                <section className="crime-map-categories">
                  <div className="crime-map-section-title">
                    <span>HISTORICAL CRIME PATTERNS</span>
                    {result.time_context?.records_used > 0 && <small>{result.time_context.records_used} records</small>}
                  </div>
                  {result.most_likely_crime ? (
                    <>
                      <div className="crime-map-top-crime">
                        <div><span>MOST REPORTED CATEGORY</span><strong>{result.most_likely_crime.category}</strong></div>
                        <b>{result.most_likely_crime.probability}%</b>
                      </div>
                      <div className="crime-map-category-list">
                        {categories.map((category) => (
                          <div className="crime-map-category-row" key={category.category}>
                            <span>{category.category}</span><b>{category.probability}%</b>
                            <i><span style={{ width: `${category.probability}%` }} /></i>
                          </div>
                        ))}
                      </div>
                      <p className="crime-map-disclaimer">Percentages are shares of synthetic recorded incidents for this hour and weekday, not the chance a crime will occur.</p>
                    </>
                  ) : (
                    <div className="crime-map-no-patterns">No sufficiently supported historical category pattern is available for this location and time.</div>
                  )}
                </section>

                <section className="crime-map-time-context">
                  <div className="crime-map-section-title"><span>TIME CONTEXT</span><Clock3 size={15} /></div>
                  <div className="crime-map-time-detail">
                    <span>{result.time_context?.date}</span>
                    <strong>{result.time_context?.time} IST</strong>
                  </div>
                  <p>{result.time_context?.period_used}</p>
                  <small>Historical data: {result.time_context?.historical_period || "Insufficient Data"}</small>
                  {dataCoverage.status === "covered" && (
                    <small className="crime-map-coverage">
                      {dataCoverage.location_cell_records} source records in this grid cell
                      {dataCoverage.merged_cell_count > 1 ? ` · pooled ${dataCoverage.merged_cell_count} cells` : ""}
                      {dataCoverage.max_neighbor_distance_km > 0
                        ? ` · neighbors up to ${dataCoverage.max_neighbor_distance_km} km`
                        : ""}
                      {dataCoverage.temporal_fallback && dataCoverage.temporal_fallback !== "observed_period"
                        ? ` · ${dataCoverage.temporal_fallback.replace(/_/g, " ")}`
                        : ""}
                    </small>
                  )}
                </section>
              </>
            )}

            <div className="crime-map-panel-footnote">
              <Check size={14} /> Synthetic Delhi dataset · Experimental estimate
            </div>
          </aside>
        </div>

        {mapError && analysisStatus !== "error" && (
          <div className="crime-map-toast" role="status"><AlertCircle size={16} />{mapError}<button onClick={() => setMapError("")} aria-label="Dismiss">×</button></div>
        )}

        <div className="crime-map-method-note">
          <Info size={15} />
          <span><strong>Synthetic dataset · Experimental estimates.</strong> Predictions estimate recorded-crime patterns in synthetic data, not verified real-world Delhi crime probabilities. Empty intervals mean no crime record was present; they are not confirmed crime-free periods. Do not use these estimates to make personal safety decisions.</span>
        </div>
      </div>
    </main>
  );
}
