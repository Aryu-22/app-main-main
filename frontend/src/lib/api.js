import axios from "axios";

const DEFAULT_BACKEND_URL = "http://localhost:8000";
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 20000 });

export const endpoints = {
  summary: () => api.get("/summary").then((r) => r.data),
  heatmap: (params = {}) => api.get("/crime/heatmap", { params }).then((r) => r.data),
  crimeZones: (at) => api.get("/crime/zones", { params: at ? { at } : {} }).then((r) => r.data),
  locationAnalysis: (latitude, longitude, at) => {
    const [date, time] = at.split("T");
    return api.get("/crime/predict", {
      params: { latitude, longitude, date, time },
    }).then((r) => r.data);
  },
  routeRisk: (payload) => api.post("/crime/route-risk", payload).then((r) => r.data),
  nearby: (lat, lng, radius_km = 2) =>
    api.get("/crime/nearby", { params: { lat, lng, radius_km } }).then((r) => r.data),
  analytics: () => api.get("/crime/analytics").then((r) => r.data),
  stations: (lat, lng) =>
    api.get("/stations", { params: lat && lng ? { lat, lng } : {} }).then((r) => r.data),
  nearestStation: (lat, lng) =>
    api.get("/stations/nearest", { params: { lat, lng } }).then((r) => r.data),
  helplines: () => api.get("/helplines").then((r) => r.data),
  addTrackingPoint: (payload) => api.post("/tracking/point", payload).then((r) => r.data),
  sos: (payload) => api.post("/sos", payload).then((r) => r.data),
};
