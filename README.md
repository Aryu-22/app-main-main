# Delhi Crime Detection & Safety Intelligence

A full-stack Delhi NCT safety dashboard with a FastAPI backend and React frontend.
It visualises experimental crime analytics, nearest police stations, helplines, and location-based risk estimates.

## Project structure

```
app-main/
├── backend/          FastAPI service + crime dataset loader
├── frontend/         React dashboard (CRA + craco)
├── data/             Delhi_dataset.csv  (synthetic Delhi crime records)
└── tests/            test assets
```

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 8+ (comes with Node) |
| MongoDB | optional — only needed for GPS trail + SOS persistence |

---

## 1) Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

### Backend environment variables

Create `backend/.env` (already present — edit values as needed):

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=lucknow_safety
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173
PREDICTION_MODE=research_demo
```

> **Notes**
> - `MONGO_URL` / `DB_NAME` are optional — without them the app runs in read-only mode (no GPS trail or SOS persistence).
> - `DB_NAME` retains the configured database name so existing MongoDB data remains untouched.
> - Crime analytics and predictions load from `data/Delhi_dataset.csv`; set `DELHI_CRIME_DATA_PATH` only if storing that dataset elsewhere.
> - `PREDICTION_MODE=research_demo` enables a full Delhi NCT research grid with distance-weighted estimates. Set it to `production` to disable the statistical fallback tier; the two modes remain explicitly separated.
> - `CORS_ORIGINS` includes both port 3000 and 3001 so `npm start` works even if port 3000 is already taken.

### Start the backend

```bash
# From the backend/ directory, with .venv active:
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Health check → [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 2) Frontend setup

```bash
cd frontend
npm install --legacy-peer-deps
```

### Frontend environment variables

`frontend/.env` is already present:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

### Start the frontend

```bash
cd frontend
npm start
```

The app opens automatically at **[http://localhost:3000](http://localhost:3000)**
(or port 3001 if 3000 is already in use — both are whitelisted in the backend CORS config).

---

## 3) Optional MongoDB setup

Without MongoDB the app still works for analytics, heatmap, and map features.
Only GPS trail saving and SOS logging require a running Mongo instance.

```bash
# Start a local MongoDB instance
mongod

# The backend/.env already points to it:
# MONGO_URL=mongodb://localhost:27017
```

---

## 4) API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/` | App info |
| `GET` | `/api/health` | Health + DB status |
| `GET` | `/api/summary` | Summary stats |
| `GET` | `/api/crime/heatmap` | Heatmap point data |
| `GET` | `/api/crime/nearby` | Delhi recorded incidents and experimental model risk around a lat/lng |
| `GET` | `/api/crime/predict` | Experimental recorded-crime probability for a Delhi location, date, and time |
| `POST` | `/api/crime/route-risk` | Delhi route-segment estimates at each segment's expected arrival time |
| `GET` | `/api/crime/analytics` | Chart analytics |
| `GET` | `/api/stations` | Police stations (sorted by distance if lat/lng given) |
| `GET` | `/api/stations/nearest` | Nearest station |
| `GET` | `/api/helplines` | Emergency contacts |
| `POST` | `/api/tracking/point` | Save GPS point *(requires Mongo)* |
| `GET` | `/api/tracking/session/{id}` | Fetch session route *(requires Mongo)* |
| `POST` | `/api/sos` | Log SOS event *(requires Mongo)* |

---

## Experimental Delhi Crime Map model

The `/map` probability estimate is an experiment using `data/Delhi_dataset.csv`, which is synthetic data, not verified Delhi Police or other real-world incident data. Generate the complete hourly grid, train and compare Random Forest and XGBoost with cyclical time features, calibrate on a chronological validation split, evaluate a geographical holdout, and save the selected model, preprocessing pipeline, and metrics with:

```bash
cd backend
python train_crime_model.py
```

Artifacts are written to `backend/artifacts/`. The API reports the prediction source and fallback status. Future requests use learned cyclical time patterns and historical reference intervals rather than requiring an exact date match.

The target is **at least one recorded crime in a cell-hour**, not the chance of a real-world crime. A zero count means no record appeared in that synthetic interval; it is not evidence that the interval was crime-free or safe. All metrics and estimates are experimental, based on a synthetic dataset, and must not be presented or used as verified real-world Delhi crime probabilities or public-safety guidance.

### Research/demo mode and estimation limits

`PREDICTION_MODE=research_demo` is the explicit default; `production` disables the demo-only spatial extrapolation tier. The model grid uses 0.02-degree cells whose centers fall inside a simplified NCT boundary polygon from OpenStreetMap relation 1942586 (ODbL attribution is included in `frontend/src/constants/delhiNctBoundary.json`). It currently yields 341 map cells; this boundary representation is simplified at approximately 100 m and is not an authoritative cadastral or police-jurisdiction boundary.

Supported cells with at least 20 source records use the calibrated XGBoost prediction. Research mode allows a 5–19-record exact cell as a **Nearby-Data Estimate**, then uses adaptive-cell, nearby-cell, similar-hour, and same-locality model predictions. As a final tier, it predicts the target time for up to five observed cells with at least five records within 15 km and combines those model outputs using `sqrt(record_count) / (1 + distance_km)^2` weights. This is a **Statistical Fallback Estimate**; it does not create crime rows or count missing intervals as confirmed zero-crime observations. Locations without any eligible neighboring support or a validated model remain Insufficient Data.

The map grid is estimated for the selected hour and cached for that hour. Route segment outputs are evaluated at estimated passage times. Route summaries use distance-weighted mean segment probability and time-weighted exposure; the route-distance shares from exact model versus fallback estimates are shown separately. Crime-category percentages are historical incident shares, not occurrence probabilities. The saved model was trained on synthetic interval labels and its outputs are uncalibrated for real-world Delhi exposure, reporting rates, or population; all research-mode values are experimental and unsuitable for safety decisions.

### Evaluation summary for research reporting

The saved evaluation uses a chronological 70%/15%/15% train, calibration, and test split. On the 357,408-interval temporal test window, XGBoost achieved ROC-AUC 0.8184, PR-AUC 0.0659, precision 0.0663, recall 0.4893, F1 0.1167, and Brier score 0.01852 (constant-prevalence Brier baseline 0.01908). Random Forest achieved ROC-AUC 0.8177, PR-AUC 0.0651, precision 0.0656, recall 0.4945, F1 0.1159, and Brier score 0.01853. XGBoost was selected based on the validation comparison.

A separate geographic holdout of 27 cells (70,956 intervals) gave ROC-AUC 0.7771, PR-AUC 0.0662, precision 0.0794, recall 0.4010, F1 0.1325, and Brier score 0.02497. These values describe prediction of synthetic recorded-event labels only; they do not establish real-world predictive validity. The low precision and PR-AUC, class imbalance, synthetic data generation, limited observed spatial cells, and absence of verified negative observations are material limitations. Full metrics and split definitions are in `backend/artifacts/delhi_model_metrics.json`.

The Delhi boundary geometry is derived from OpenStreetMap; © OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright.

## Delhi Safe Route recommendations

The Safe Route page requests road-network routes and alternatives from the OpenStreetMap OSRM routing service, then submits sampled road segments to `/api/crime/route-risk`. Segment requests are evaluated by the Delhi model at the estimated passage time using the same hierarchical coverage fallbacks as the Crime Map. Route travel times do not include live traffic. Segment estimates are synthetic and experimental; unsupported segments stay Unknown, and no route is guaranteed safe.

---

## 5) Production build

```bash
# Backend — just remove --reload for production
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000

# Frontend — build static bundle
cd frontend
npm run build
```

Serve the `frontend/build/` folder from any static host or Nginx.

---

## 6) Troubleshooting

| Problem | Fix |
|---------|-----|
| Frontend can't reach backend | Check `REACT_APP_BACKEND_URL` in `frontend/.env` |
| Backend can't read crime data | Verify `data/Delhi_dataset.csv` exists in the repo root |
| Mongo writes fail | Confirm `mongod` is running and `MONGO_URL` in `backend/.env` is correct |
| Port 3000 already in use | `npm start` will auto-switch to 3001 — that's fine, CORS allows both |
| `craco` ESLint warning at startup | Non-fatal — safely ignored. Fixed in `craco.config.js` with `eslint: { enable: false }` |
| npm peer dep errors | Always use `npm install --legacy-peer-deps` for this project |
| `uvicorn` port 8000 in use | Find and kill: `netstat -ano \| findstr :8000` then `taskkill /PID <id> /F` |
