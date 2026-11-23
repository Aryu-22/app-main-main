import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  AlertCircle,
  ArrowLeftRight,
  Car,
  Clock3,
  Info,
  LoaderCircle,
  MapPin,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { endpoints } from "../lib/api";
import {
  DELHI_BOUNDS,
  DELHI_CENTER,
  DELHI_LANDMARKS,
  isWithinDelhi,
} from "../constants/delhiData";

const ROUTE_COLORS = ["#38bdf8", "#c084fc", "#34d399"];
const ZONE_COLORS = {
  Green: "#22c55e",
  Yellow: "#f59e0b",
  Red: "#ef4444",
};
const ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const ROUTE_SEGMENT_LENGTH_KM = 0.75;
const MIN_RECOMMENDED_COVERAGE = 0.8;
const MAX_RECOMMENDED_DETOUR = 1.25;

const startIcon = L.divIcon({
  className: "",
  html: '<div style="width:25px;height:25px;border-radius:50%;background:#22c55e;border:3px solid #07111f;color:#07111f;display:grid;place-items:center;font-size:11px;font-weight:800">A</div>',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

const endIcon = L.divIcon({
  className: "",
  html: '<div style="width:25px;height:25px;border-radius:50%;background:#fb7185;border:3px solid #07111f;color:#07111f;display:grid;place-items:center;font-size:11px;font-weight:800">B</div>',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

function MapRecenter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds?.length === 2) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [bounds, map]);
  return null;
}

function MapClickSelector({ target, onPick }) {
  useMapEvents({
    click({ latlng }) {
      onPick(target, latlng.lat, latlng.lng);
    },
  });
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

function isDelhiNctAddress(address = {}) {
  const state = String(address.state || address.province || "").trim().toLowerCase();
  if (state) {
    return state.includes("delhi") && !state.includes("haryana");
  }
  const district = String(address.state_district || address.city || "").trim().toLowerCase();
  return district === "delhi" || district === "new delhi";
}

function distanceKm(first, second) {
  const radians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = radians(second[1] - first[1]);
  const longitudeDelta = radians(second[0] - first[0]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first[1]))
      * Math.cos(radians(second[1]))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointAtDistance(coordinates, cumulativeKm, distance) {
  let index = 1;
  while (index < cumulativeKm.length - 1 && cumulativeKm[index] < distance) {
    index += 1;
  }
  const startDistance = cumulativeKm[index - 1];
  const segmentDistance = cumulativeKm[index] - startDistance;
  const fraction = segmentDistance > 0 ? (distance - startDistance) / segmentDistance : 0;
  return [
    coordinates[index - 1][0] + (coordinates[index][0] - coordinates[index - 1][0]) * fraction,
    coordinates[index - 1][1] + (coordinates[index][1] - coordinates[index - 1][1]) * fraction,
  ];
}

function buildRiskSegments(route) {
  const coordinates = route.coordinates;
  const cumulativeKm = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeKm.push(
      cumulativeKm[index - 1] + distanceKm(coordinates[index - 1], coordinates[index]),
    );
  }
  const totalKm = cumulativeKm[cumulativeKm.length - 1];
  if (!Number.isFinite(totalKm) || totalKm <= 0) return [];

  const segmentCount = Math.max(1, Math.ceil(totalKm / ROUTE_SEGMENT_LENGTH_KM));
  return Array.from({ length: segmentCount }, (_, index) => {
    const startKm = (totalKm * index) / segmentCount;
    const endKm = (totalKm * (index + 1)) / segmentCount;
    const midpointKm = (startKm + endKm) / 2;
    const start = pointAtDistance(coordinates, cumulativeKm, startKm);
    const end = pointAtDistance(coordinates, cumulativeKm, endKm);
    const midpoint = pointAtDistance(coordinates, cumulativeKm, midpointKm);
    const line = [start];
    for (let pointIndex = 1; pointIndex < coordinates.length - 1; pointIndex += 1) {
      if (
        cumulativeKm[pointIndex] > startKm
        && cumulativeKm[pointIndex] < endKm
      ) {
        line.push(coordinates[pointIndex]);
      }
    }
    line.push(end);
    const durationMinutes = route.durationMinutes * ((endKm - startKm) / totalKm);

    return {
      segment_id: `${route.id}-segment-${index}`,
      latitude: midpoint[1],
      longitude: midpoint[0],
      minutes_from_departure: route.durationMinutes * (midpointKm / totalKm),
      duration_minutes: Math.max(durationMinutes, 0.01),
      distance_km: endKm - startKm,
      distance_from_start_km: startKm,
      positions: line.map(([longitude, latitude]) => [latitude, longitude]),
    };
  });
}

function LocationSearch({
  label,
  value,
  selectedLocation,
  tone,
  onChange,
  onSelect,
}) {
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");

  const landmarkSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (query.length < 2) return [];
    return DELHI_LANDMARKS
      .filter((landmark) => (
        landmark.name.toLowerCase().includes(query)
        || landmark.district.toLowerCase().includes(query)
      ))
      .slice(0, 4)
      .map((landmark) => ({
        key: landmark.id,
        label: landmark.name,
        detail: landmark.district,
        lat: landmark.lat,
        lng: landmark.lng,
      }));
  }, [value]);

  useEffect(() => {
    const query = value.trim();
    if (
      query.length < 3
      || (selectedLocation && query === selectedLocation.label)
    ) {
      setRemoteSuggestions([]);
      setSearchStatus("idle");
      setSearchMessage("");
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setSearchStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          addressdetails: "1",
          limit: "6",
          countrycodes: "in",
          bounded: "1",
          viewbox: "76.8388351,28.8834464,77.3453379,28.4046285",
          q: `${query}, Delhi, India`,
        });
        const response = await fetch(`${NOMINATIM_URL}?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Delhi location search is unavailable.");
        const results = await response.json();
        const suggestions = results
          .filter((item) => (
            isWithinDelhi(Number(item.lat), Number(item.lon))
            && isDelhiNctAddress(item.address)
          ))
          .map((item, index) => ({
            key: `search-${index}-${item.place_id}`,
            label: item.name || item.display_name.split(",").slice(0, 2).join(","),
            detail: item.display_name,
            lat: Number(item.lat),
            lng: Number(item.lon),
          }));
        if (!active) return;
        setRemoteSuggestions(suggestions);
        setSearchStatus(suggestions.length ? "ready" : "empty");
        setSearchMessage(suggestions.length ? "" : "No matching address found within Delhi NCT.");
      } catch (error) {
        if (!active || error.name === "AbortError") return;
        setRemoteSuggestions([]);
        setSearchStatus("error");
        setSearchMessage(error.message || "Location search failed.");
      }
    }, 550);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, selectedLocation]);

  const suggestions = [...landmarkSuggestions, ...remoteSuggestions]
    .filter((suggestion, index, list) => (
      list.findIndex((item) => (
        Math.abs(item.lat - suggestion.lat) < 0.0001
        && Math.abs(item.lng - suggestion.lng) < 0.0001
      )) === index
    ))
    .slice(0, 6);

  const choose = (suggestion) => {
    onSelect({
      lat: suggestion.lat,
      lng: suggestion.lng,
      label: suggestion.label,
      detail: suggestion.detail,
    });
    setRemoteSuggestions([]);
    setSearchMessage("");
  };

  return (
    <div>
      <label className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-mono uppercase ${tone}`}>
        <MapPin className="h-3.5 w-3.5" />
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions.length) {
              event.preventDefault();
              choose(suggestions[0]);
            }
          }}
          placeholder="Search a Delhi locality or address"
          aria-label={label}
          autoComplete="off"
          className="w-full rounded-lg border border-white/15 bg-[#070A11] py-2.5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white"
            onClick={() => onChange("")}
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {suggestions.length > 0 && (
          <div className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/10 bg-[#111827] p-1 shadow-xl">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() => choose(suggestion)}
                className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-white/5"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-white">{suggestion.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{suggestion.detail}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {!suggestions.length && searchStatus === "loading" && value.trim().length >= 3 && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <LoaderCircle className="h-3 w-3 animate-spin" /> Searching Delhi addresses…
          </p>
        )}
        {!suggestions.length && searchMessage && value.trim().length >= 3 && (
          <p className={`mt-1 text-[10px] ${searchStatus === "error" ? "text-rose-300" : "text-slate-500"}`}>
            {searchMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function estimateRoute(route, result) {
  const resultById = new Map((result?.segments || []).map((segment) => [segment.segment_id, segment]));
  const segments = route.segments.map((segment) => ({
    ...segment,
    prediction: resultById.get(segment.segment_id) || null,
  }));
  const totalDistanceKm = segments.reduce((sum, segment) => sum + segment.distance_km, 0);
  const covered = segments.filter(
    (segment) => segment.prediction?.crime_probability?.status === "ok",
  );
  const coveredDistanceKm = covered.reduce((sum, segment) => sum + segment.distance_km, 0);
  const distanceWeightedProbability = covered.reduce(
    (sum, segment) => (
      sum
      + (segment.prediction.crime_probability.percentage / 100)
        * segment.distance_km
    ),
    0,
  );
  const meanProbability = coveredDistanceKm
    ? distanceWeightedProbability / coveredDistanceKm
    : null;
  const exposureHours = covered.reduce(
    (sum, segment) => (
      sum
      + (segment.prediction.crime_probability.percentage / 100)
        * (segment.duration_minutes / 60)
    ),
    0,
  );
  const coverage = totalDistanceKm ? coveredDistanceKm / totalDistanceKm : 0;
  const exactModelDistanceKm = covered
    .filter((segment) => segment.prediction.estimate_type === "model_based")
    .reduce((sum, segment) => sum + segment.distance_km, 0);
  const statisticalFallbackDistanceKm = covered
    .filter((segment) => segment.prediction.estimate_type !== "model_based")
    .reduce((sum, segment) => sum + segment.distance_km, 0);
  const majorRiskSegments = covered
    .filter((segment) => (
      segment.prediction.safety_zone === "Red"
      || segment.prediction.safety_zone === "Yellow"
    ))
    .sort((first, second) => (
      (second.prediction.safety_zone === "Red" ? 1 : 0)
        - (first.prediction.safety_zone === "Red" ? 1 : 0)
      || second.prediction.crime_probability.percentage
        - first.prediction.crime_probability.percentage
    ))
    .slice(0, 3);
  const categoryWeights = new Map();
  covered.forEach((segment) => {
    const predictedProbability = segment.prediction.crime_probability.percentage / 100;
    const categories = [
      segment.prediction.most_likely_crime,
      ...(segment.prediction.other_crime_categories || []),
    ].filter(Boolean);
    categories.forEach((category) => {
      const contribution = (
        predictedProbability
        * segment.duration_minutes
        * category.probability / 100
      );
      categoryWeights.set(
        category.category,
        (categoryWeights.get(category.category) || 0) + contribution,
      );
    });
  });
  const categoryTotal = Array.from(categoryWeights.values())
    .reduce((sum, contribution) => sum + contribution, 0);
  const contributingCategories = Array.from(categoryWeights.entries())
    .map(([category, contribution]) => ({
      category,
      share: categoryTotal ? (contribution / categoryTotal) * 100 : 0,
    }))
    .sort((first, second) => second.share - first.share)
    .slice(0, 3);
  const thresholds = result?.risk_probability_thresholds;
  const safetyZone = (
    meanProbability === null
    || coverage < MIN_RECOMMENDED_COVERAGE
    || !thresholds
  )
    ? "Unknown"
    : meanProbability <= thresholds[0]
      ? "Green"
      : meanProbability <= thresholds[1]
        ? "Yellow"
        : "Red";

  return {
    ...route,
    segments,
    coveredDistanceKm,
    coverage,
    exactModelDistancePercent: totalDistanceKm
      ? (exactModelDistanceKm / totalDistanceKm) * 100
      : 0,
    fallbackEstimateDistancePercent: totalDistanceKm
      ? (statisticalFallbackDistanceKm / totalDistanceKm) * 100
      : 0,
    uncoveredDistancePercent: totalDistanceKm
      ? (Math.max(0, totalDistanceKm - coveredDistanceKm) / totalDistanceKm) * 100
      : 100,
    meanProbability,
    exposureHours,
    majorRiskSegments,
    contributingCategories,
    safetyZone,
    riskError: result?.error || "",
  };
}

export default function SafeRoute() {
  const defaultSource = DELHI_LANDMARKS.find((landmark) => landmark.id === "cp");
  const defaultDestination = DELHI_LANDMARKS.find((landmark) => landmark.id === "hauz-khas");
  const [source, setSource] = useState({
    lat: defaultSource.lat,
    lng: defaultSource.lng,
    label: defaultSource.name,
    detail: defaultSource.district,
  });
  const [destination, setDestination] = useState({
    lat: defaultDestination.lat,
    lng: defaultDestination.lng,
    label: defaultDestination.name,
    detail: defaultDestination.district,
  });
  const [sourceSearch, setSourceSearch] = useState(defaultSource.name);
  const [destinationSearch, setDestinationSearch] = useState(defaultDestination.name);
  const [mapSelectionTarget, setMapSelectionTarget] = useState("source");
  const [departureInput, setDepartureInput] = useState(() => toDelhiLocalInput(new Date()));
  const [roadRoutes, setRoadRoutes] = useState([]);
  const [riskByRoute, setRiskByRoute] = useState({});
  const [routeStatus, setRouteStatus] = useState("idle");
  const [riskStatus, setRiskStatus] = useState("idle");
  const [routeError, setRouteError] = useState("");
  const [locationVerification, setLocationVerification] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const routeRequestId = useRef(0);

  const setLocationText = (which, value) => {
    routeRequestId.current += 1;
    if (which === "source") {
      setSourceSearch(value);
      setSource(null);
    } else {
      setDestinationSearch(value);
      setDestination(null);
    }
    setRoadRoutes([]);
    setRiskByRoute({});
    setRouteStatus("idle");
    setRouteError("");
    setSelectedSegmentId(null);
  };

  const setLocation = (which, location) => {
    if (!isWithinDelhi(location.lat, location.lng)) {
      setRouteError("Choose a start and destination within the NCT of Delhi.");
      return;
    }
    routeRequestId.current += 1;
    setRouteError("");
    if (which === "source") {
      setSource(location);
      setSourceSearch(location.label);
    } else {
      setDestination(location);
      setDestinationSearch(location.label);
    }
    setRoadRoutes([]);
    setRiskByRoute({});
    setRouteStatus("idle");
    setSelectedSegmentId(null);
  };

  const swapLocations = () => {
    routeRequestId.current += 1;
    setSource(destination);
    setDestination(source);
    setSourceSearch(destinationSearch);
    setDestinationSearch(sourceSearch);
    setRoadRoutes([]);
    setRiskByRoute({});
    setRouteStatus("idle");
  };

  const applyPreset = (sourceId, destinationId) => {
    const sourceLandmark = DELHI_LANDMARKS.find((item) => item.id === sourceId);
    const destinationLandmark = DELHI_LANDMARKS.find((item) => item.id === destinationId);
    if (!sourceLandmark || !destinationLandmark) return;
    setLocation("source", {
      lat: sourceLandmark.lat,
      lng: sourceLandmark.lng,
      label: sourceLandmark.name,
      detail: sourceLandmark.district,
    });
    setLocation("destination", {
      lat: destinationLandmark.lat,
      lng: destinationLandmark.lng,
      label: destinationLandmark.name,
      detail: destinationLandmark.district,
    });
  };

  const pickMapLocation = async (which, latitude, longitude) => {
    if (!isWithinDelhi(latitude, longitude)) {
      setRouteError("Map selections must remain within the NCT of Delhi.");
      return;
    }
    setLocationVerification(true);
    setRouteError("");
    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        zoom: "10",
        lat: String(latitude),
        lon: String(longitude),
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
      if (!response.ok) throw new Error("Could not verify the selected point's district.");
      const place = await response.json();
      if (!isDelhiNctAddress(place.address)) {
        throw new Error("That point is outside or could not be verified within the NCT of Delhi.");
      }
      setLocation(which, {
        lat: latitude,
        lng: longitude,
        label: place.name || place.display_name?.split(",").slice(0, 2).join(",")
          || `Map point ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        detail: place.display_name || "Verified within Delhi NCT",
      });
    } catch (error) {
      setRouteError(error.message || "Could not verify the map selection in Delhi NCT.");
    } finally {
      setLocationVerification(false);
    }
  };

  const findRoutes = async () => {
    if (!source || !destination) {
      setRouteError("Select both a start and destination from Delhi search results.");
      return;
    }
    if (
      Math.abs(source.lat - destination.lat) < 0.00001
      && Math.abs(source.lng - destination.lng) < 0.00001
    ) {
      setRouteError("Choose different start and destination locations.");
      return;
    }

    const requestId = routeRequestId.current + 1;
    routeRequestId.current = requestId;
    setRouteStatus("loading");
    setRouteError("");
    setRoadRoutes([]);
    setRiskByRoute({});
    setRiskStatus("idle");
    setSelectedSegmentId(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      let response;
      try {
        const url = new URL(
          `${ROUTING_URL}/${source.lng},${source.lat};${destination.lng},${destination.lat}`,
        );
        url.search = new URLSearchParams({
          alternatives: "3",
          overview: "full",
          geometries: "geojson",
          steps: "false",
        }).toString();
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("The OpenStreetMap routing service is unavailable.");
      const data = await response.json();
      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("No road route was found between these Delhi locations.");
      }
      const parsed = data.routes
        .filter((route) => (
          route.geometry?.coordinates?.length > 1
          && route.geometry.coordinates.every(([longitude, latitude]) => (
            isWithinDelhi(latitude, longitude)
          ))
        ))
        .map((route, index) => {
          const value = {
            id: `route-${requestId}-${index}`,
            name: `Road route ${index + 1}`,
            coordinates: route.geometry.coordinates,
            distanceKm: route.distance / 1000,
            durationMinutes: route.duration / 60,
            color: ROUTE_COLORS[index % ROUTE_COLORS.length],
          };
          return {
            ...value,
            segments: buildRiskSegments(value),
          };
        })
        .filter((route) => route.segments.length > 0);
      if (!parsed.length) {
        throw new Error("No route remained fully within the Delhi NCT coverage area.");
      }
      if (requestId !== routeRequestId.current) return;
      setRoadRoutes(parsed);
      setActiveRouteId(parsed[0].id);
      setRouteStatus("ready");
    } catch (error) {
      if (requestId !== routeRequestId.current) return;
      setRouteStatus("error");
      setRouteError(
        error.name === "AbortError"
          ? "Road routing timed out. Please try again."
          : error.message || "Could not calculate Delhi road routes.",
      );
    }
  };

  useEffect(() => {
    if (!roadRoutes.length) return undefined;
    let active = true;
    setRiskStatus("loading");
    setRiskByRoute({});
    const analyzeRoutes = async () => {
      const entries = await Promise.all(roadRoutes.map(async (route) => {
        try {
          const result = await endpoints.routeRisk({
            departure_at: toDelhiIso(departureInput),
            segments: route.segments.map((segment) => ({
              segment_id: segment.segment_id,
              latitude: segment.latitude,
              longitude: segment.longitude,
              minutes_from_departure: segment.minutes_from_departure,
              duration_minutes: segment.duration_minutes,
            })),
          });
          return [route.id, result];
        } catch (error) {
          return [
            route.id,
            {
              error: error.response?.data?.detail
                || "Delhi crime-risk analysis is unavailable.",
              segments: [],
              risk_probability_thresholds: null,
            },
          ];
        }
      }));
      if (!active) return;
      setRiskByRoute(Object.fromEntries(entries));
      setRiskStatus("ready");
    };
    analyzeRoutes();
    return () => {
      active = false;
    };
  }, [roadRoutes, departureInput]);

  const routes = useMemo(
    () => roadRoutes.map((route) => estimateRoute(route, riskByRoute[route.id])),
    [roadRoutes, riskByRoute],
  );
  const shortestRoute = useMemo(
    () => routes.reduce(
      (shortest, route) => (!shortest || route.distanceKm < shortest.distanceKm ? route : shortest),
      null,
    ),
    [routes],
  );
  const safestRoute = useMemo(() => {
    if (!shortestRoute || riskStatus !== "ready") return null;
    return routes
      .filter((route) => (
        route.safetyZone !== "Unknown"
        && route.coverage >= MIN_RECOMMENDED_COVERAGE
        && route.distanceKm <= shortestRoute.distanceKm * MAX_RECOMMENDED_DETOUR
      ))
      .sort((first, second) => (
        first.exposureHours - second.exposureHours
        || first.durationMinutes - second.durationMinutes
      ))[0] || null;
  }, [routes, shortestRoute, riskStatus]);
  const alternativeRoute = useMemo(
    () => routes.find((route) => (
      route.id !== safestRoute?.id && route.id !== shortestRoute?.id
    )) || routes.find((route) => route.id !== safestRoute?.id) || null,
    [routes, safestRoute, shortestRoute],
  );
  const activeRoute = routes.find((route) => route.id === activeRouteId) || routes[0];
  const routeBounds = useMemo(
    () => source && destination
      ? [[source.lat, source.lng], [destination.lat, destination.lng]]
      : null,
    [source, destination],
  );
  const selectedSegment = routes
    .flatMap((route) => route.segments.map((segment) => ({ ...segment, route })))
    .find((segment) => (
      `${segment.route.id}:${segment.segment_id}` === selectedSegmentId
    ));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8" data-testid="safe-route-page">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            NCT OF DELHI · EXPERIMENTAL ROUTE RISK
          </div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Delhi Safe Route Finder
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Compare OpenStreetMap road routes using XGBoost and distance-weighted research estimates.
            No route is guaranteed safe.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-white/10 bg-[#111622] px-3 py-2 text-xs text-slate-300 md:self-auto">
          <Car className="h-4 w-4 text-cyan-300" /> Driving routes · Delhi NCT only
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-5">
          <div className="relative rounded-2xl border border-white/10 bg-[#0F1422] p-5 shadow-lg">
            <div className="space-y-4">
              <LocationSearch
                label="Start location"
                value={sourceSearch}
                selectedLocation={source}
                tone="text-emerald-300"
                onChange={(value) => setLocationText("source", value)}
                onSelect={(location) => setLocation("source", location)}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="h-px flex-1 bg-white/10" />
                <button
                  type="button"
                  onClick={swapLocations}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-[#111622] text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
                  aria-label="Swap start and destination"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <LocationSearch
                label="Destination"
                value={destinationSearch}
                selectedLocation={destination}
                tone="text-rose-300"
                onChange={(value) => setLocationText("destination", value)}
                onSelect={(location) => setLocation("destination", location)}
              />
              <label className="block text-[11px] font-mono uppercase text-slate-400">
                Departure date and time (IST)
                <input
                  type="datetime-local"
                  value={departureInput}
                  onChange={(event) => setDepartureInput(event.target.value || toDelhiLocalInput(new Date()))}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#070A11] px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setMapSelectionTarget("source")}
                className={`rounded-full border px-2.5 py-1 text-[10px] ${mapSelectionTarget === "source" ? "border-emerald-400/50 text-emerald-300" : "border-white/10 text-slate-500"}`}
              >
                Click map to set start
              </button>
              <button
                type="button"
                onClick={() => setMapSelectionTarget("destination")}
                className={`rounded-full border px-2.5 py-1 text-[10px] ${mapSelectionTarget === "destination" ? "border-rose-400/50 text-rose-300" : "border-white/10 text-slate-500"}`}
              >
                Click map to set destination
              </button>
              {source && destination && (
                <span className="ml-auto self-center text-[10px] text-slate-500">
                  Both endpoints are within Delhi NCT
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
            {[
              { sourceId: "cp", destinationId: "hauz-khas", label: "CP → Hauz Khas" },
              { sourceId: "dwarka-sec21", destinationId: "india-gate", label: "Dwarka → India Gate" },
              { sourceId: "rohini-sec10", destinationId: "chandni-chowk", label: "Rohini → Old Delhi" },
              { sourceId: "civil-lines", destinationId: "saket", label: "Civil Lines → Saket" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.sourceId, preset.destinationId)}
                className="shrink-0 rounded-md border border-white/10 bg-[#111622] px-2.5 py-1.5 text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={findRoutes}
            disabled={routeStatus === "loading" || locationVerification || !source || !destination}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {routeStatus === "loading"
              ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : <RouteIcon className="h-4 w-4" />}
            {routeStatus === "loading" ? "Finding Delhi road routes…" : "Find and compare routes"}
          </button>

          {routeError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{routeError}</span>
            </div>
          )}

          {routeStatus === "idle" && (
            <p className="rounded-xl border border-white/5 bg-[#0F1422] p-3 text-xs leading-relaxed text-slate-400">
              Search for an address or click the Delhi map to choose both endpoints. Route distances
              and travel times come from OpenStreetMap routing; travel times are estimates without live traffic.
            </p>
          )}
          {locationVerification && (
            <p className="flex items-center gap-2 text-[10px] text-cyan-200">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Verifying the selected map point is within Delhi NCT…
            </p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 text-xs font-mono uppercase tracking-widest text-slate-400">
              <span>Road route comparison</span>
              <span>{routes.length} available</span>
            </div>
            {routeStatus === "loading" && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0F1422] p-4 text-xs text-slate-300">
                <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" />
                Requesting road-network alternatives…
              </div>
            )}
            {routes.map((route) => {
              const isActive = route.id === activeRoute?.id;
              const roles = [
                route.id === shortestRoute?.id ? "Shortest Route" : null,
                route.id === safestRoute?.id ? "Safest Estimated" : null,
                route.id === alternativeRoute?.id ? "Alternative" : null,
              ].filter(Boolean);
              return (
                <button
                  type="button"
                  key={route.id}
                  onClick={() => {
                    setActiveRouteId(route.id);
                    setSelectedSegmentId(null);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${isActive ? "border-cyan-400/60 bg-[#0F172A] ring-1 ring-cyan-400/30" : "border-white/10 bg-[#0F1422] hover:border-white/20"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map((role) => (
                          <span key={role} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">{role}</span>
                        ))}
                        {riskStatus === "loading" && (
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2 py-0.5 text-[9px] text-cyan-200">Analyzing segments…</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: route.color }} />
                        <h2 className="truncate text-sm font-bold text-white">{route.name}</h2>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className="text-sm font-bold"
                        style={{ color: ZONE_COLORS[route.safetyZone] || "#94a3b8" }}
                      >
                        {route.safetyZone === "Unknown" ? "Unknown" : `${route.safetyZone} zone`}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {Math.round(route.coverage * 100)}% route distance estimated
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-[11px] sm:grid-cols-4">
                    <div>
                      <span className="block text-slate-500">Distance</span>
                      <b className="text-slate-200">{route.distanceKm.toFixed(1)} km</b>
                    </div>
                    <div>
                      <span className="block text-slate-500">Travel time</span>
                      <b className="text-slate-200">{Math.round(route.durationMinutes)} min</b>
                    </div>
                    <div>
                      <span className="block text-slate-500">Mean segment estimate</span>
                      <b className="text-slate-200">
                        {route.meanProbability === null ? "Unavailable" : `${(route.meanProbability * 100).toFixed(1)}%`}
                      </b>
                    </div>
                    <div>
                      <span className="block text-slate-500">Weighted exposure</span>
                      <b className="text-slate-200">{route.exposureHours.toFixed(2)} risk-hours</b>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                    <span>Model-based distance: {route.exactModelDistancePercent.toFixed(0)}%</span>
                    <span>Fallback-estimated distance: {route.fallbackEstimateDistancePercent.toFixed(0)}%</span>
                    {route.uncoveredDistancePercent > 0.1 && (
                      <span>Unestimated distance: {route.uncoveredDistancePercent.toFixed(0)}%</span>
                    )}
                  </div>
                  {riskStatus === "ready" && (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3 text-[10px]">
                      <div>
                        <span className="font-mono uppercase text-slate-500">Major risk-prone segments</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {route.majorRiskSegments.length ? route.majorRiskSegments.map((segment) => (
                            <span
                              key={segment.segment_id}
                              className="rounded border px-1.5 py-1"
                              style={{
                                color: ZONE_COLORS[segment.prediction.safety_zone],
                                borderColor: `${ZONE_COLORS[segment.prediction.safety_zone]}55`,
                              }}
                            >
                              {segment.distance_from_start_km.toFixed(1)} km · {segment.prediction.safety_zone}
                              {" · "}
                              {segment.prediction.crime_probability.percentage}%
                            </span>
                          )) : (
                            <span className="text-slate-500">
                              {route.coverage < MIN_RECOMMENDED_COVERAGE
                                ? "Insufficient Data to identify risk-prone segments."
                                : "No supported elevated-risk segment identified; this is not a safety guarantee."}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="font-mono uppercase text-slate-500">Contributing historical crime categories</span>
                        <p className="mt-1 text-slate-300">
                          {route.contributingCategories.length
                            ? route.contributingCategories.map((item) => `${item.category} ${item.share.toFixed(0)}%`).join(" · ")
                            : "Insufficient category data"}
                        </p>
                        {route.contributingCategories.length > 0 && (
                          <p className="mt-1 text-slate-500">
                            Relative historical category mix across supported route segments; not category event probabilities.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {route.riskError && (
                    <p className="mt-2 text-[10px] text-amber-200">{route.riskError}</p>
                  )}
                  {route.safetyZone === "Unknown" && !route.riskError && riskStatus === "ready" && (
                    <p className="mt-2 text-[10px] text-amber-200">
                      Insufficient supported segment coverage for a route-level safety zone.
                    </p>
                  )}
                </button>
              );
            })}
            {riskStatus === "ready" && routes.length > 0 && (
              <p className="px-1 text-[10px] leading-relaxed text-slate-500">
                The safest estimated recommendation compares routes with at least 80% estimated
                distance and no more than 25% detour from the shortest. Routes are ranked by
                distance-weighted risk and estimated exposure time; unknown segments never count as low risk.
                {!safestRoute && " Current coverage is insufficient to identify a safest estimated route."}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 lg:col-span-7">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <MapContainer
              center={[DELHI_CENTER.lat, DELHI_CENTER.lng]}
              zoom={DELHI_CENTER.zoom}
              scrollWheelZoom
              maxBounds={DELHI_BOUNDS}
              maxBoundsViscosity={0.9}
              minZoom={10}
              style={{ height: "58vh", minHeight: 460 }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {routes.map((route) => (
                <Polyline
                  key={`${route.id}-base`}
                  positions={route.coordinates.map(([longitude, latitude]) => [latitude, longitude])}
                  pathOptions={{
                    color: route.color,
                    weight: route.id === activeRoute?.id ? 7 : 4,
                    opacity: route.id === activeRoute?.id ? 0.8 : 0.38,
                  }}
                  eventHandlers={{
                    click: () => setActiveRouteId(route.id),
                  }}
                />
              ))}
              {routes.map((route) => route.segments.map((segment) => {
                const zone = segment.prediction?.safety_zone || "Unknown";
                const color = ZONE_COLORS[zone] || "#94a3b8";
                return (
                  <Polyline
                    key={`${route.id}-${segment.segment_id}`}
                    positions={segment.positions}
                    pathOptions={{
                      color,
                      weight: route.id === activeRoute?.id ? 4 : 2.5,
                      opacity: route.id === activeRoute?.id ? 0.98 : 0.72,
                      dashArray: zone === "Unknown" ? "4 6" : undefined,
                    }}
                    eventHandlers={{
                      click: () => {
                        setActiveRouteId(route.id);
                        setSelectedSegmentId(`${route.id}:${segment.segment_id}`);
                      },
                    }}
                  />
                );
              }))}
              {source && (
                <Marker position={[source.lat, source.lng]} icon={startIcon}>
                  <Popup><b>Start:</b> {source.label}</Popup>
                </Marker>
              )}
              {destination && (
                <Marker position={[destination.lat, destination.lng]} icon={endIcon}>
                  <Popup><b>Destination:</b> {destination.label}</Popup>
                </Marker>
              )}
              <MapClickSelector target={mapSelectionTarget} onPick={pickMapLocation} />
              <MapRecenter bounds={routeBounds} />
            </MapContainer>

            <div className="absolute left-3 top-3 z-[400] rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-[10px] text-slate-300">
              Click map to set {mapSelectionTarget === "source" ? "start" : "destination"}
            </div>
            <div className="absolute bottom-3 left-3 right-3 z-[400] flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-[10px]">
              <span className="text-slate-400">SAFETY</span>
              {[
                ["Green", "Lower estimate"],
                ["Yellow", "Moderate estimate"],
                ["Red", "Higher estimate"],
              ].map(([zone, description]) => (
                <span key={zone} className="flex items-center gap-1.5 text-slate-300">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ZONE_COLORS[zone] }} />
                  {zone} · {description}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-slate-300">
                <i className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Unknown
              </span>
              {routes.map((route, index) => (
                <span key={route.id} className="flex items-center gap-1.5 text-slate-400">
                  <i className="h-1 w-4 rounded-full" style={{ backgroundColor: route.color }} />
                  Route {index + 1}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F1422] p-5 shadow-lg">
            {selectedSegment ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5" style={{ color: ZONE_COLORS[selectedSegment.prediction?.safety_zone] || "#94a3b8" }} />
                      <h2 className="text-base font-bold text-white">
                        {selectedSegment.route.name} · segment details
                      </h2>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {selectedSegment.distance_km.toFixed(2)} km segment · {selectedSegment.prediction?.arrival_time
                        ? new Date(selectedSegment.prediction.arrival_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
                        : "arrival time unavailable"} IST
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{ color: ZONE_COLORS[selectedSegment.prediction?.safety_zone] || "#94a3b8" }}>
                      {selectedSegment.prediction?.risk_level || "Unknown / Insufficient Data"}
                    </div>
                    <div className="text-xs text-slate-300">
                      {selectedSegment.prediction?.crime_probability?.status === "ok"
                        ? `${selectedSegment.prediction.crime_probability.percentage}% segment estimate`
                        : "Insufficient Data"}
                    </div>
                  </div>
                </div>
                {selectedSegment.prediction?.coverage?.status === "covered" && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    {selectedSegment.prediction.estimate_label || selectedSegment.prediction.prediction_source?.replace(/_/g, " ")}
                    {selectedSegment.prediction.fallback_used ? " · fallback estimate" : ""}
                  </p>
                )}
                {selectedSegment.prediction?.most_likely_crime && (
                  <div className="mt-3 rounded-lg bg-[#070A11] p-3">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Historical category mix</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-200">
                      <span>{selectedSegment.prediction.most_likely_crime.category}: {selectedSegment.prediction.most_likely_crime.probability}%</span>
                      {selectedSegment.prediction.other_crime_categories?.slice(0, 3).map((category) => (
                        <span key={category.category}>{category.category}: {category.probability}%</span>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Category percentages are historical incident shares, not likelihood that this category will occur.
                    </p>
                  </div>
                )}
                {selectedSegment.prediction?.crime_probability?.status !== "ok" && (
                  <p className="mt-3 rounded-lg border border-slate-400/15 bg-slate-400/5 p-3 text-xs text-slate-300">
                    Insufficient Data for this road segment and arrival time. Missing records are not evidence of safety.
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {activeRoute ? `Selected route: ${activeRoute.name}` : "Compare Delhi road routes"}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Click a colored road segment to inspect its estimated arrival time, model estimate,
                    coverage, and historical crime-category mix.
                    {riskStatus === "loading" ? " Segment analysis is in progress." : ""}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-[10px] leading-relaxed text-amber-100/80">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Research/demo mode uses XGBoost model estimates for supported cells, nearby-data estimates,
              then distance-weighted estimates from supported synthetic grid cells at each segment’s arrival time.
              OpenStreetMap travel-time estimates do not include live traffic.
              They are not verified real-world crime probabilities or personal safety guarantees. Zero-record
              intervals are not confirmed crime-free periods.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
