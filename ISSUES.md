# Project Issues Review

Status: All 18 issues identified in the Oct 2026 audit have been resolved.

## Resolved issues (Oct 2026 audit)

### Backend
- `logger` is now defined at the top of `server.py`, before any route handlers that call it.
- Deprecated `@app.on_event("shutdown")` replaced with an `asynccontextmanager` lifespan.
- CORS middleware is now registered *before* `app.include_router(api_router)`.
- Legacy demo routing and non-Delhi crime data dependencies were removed; analytics now use the Delhi dataset and model.
- `requirements.txt` cleaned: removed ~15 unused packages (boto3, bcrypt, pyjwt, passlib, python-jose, boto3, requests-oauthlib, cryptography, email-validator, python-multipart, jq, typer, requests).

### Frontend
- `Analytics.jsx` now has a `.catch()` handler, an error card with a Retry button, and a spinner loading state.
- `App.js` now includes a React `ErrorBoundary` and a `<Route path="*">` 404 page.
- `LiveMap.jsx` cleanup `useEffect` added — GPS `watchPosition` and `setInterval` are both cleared on component unmount.
- `Stations.jsx` `load()` preserves the user's selected station after a re-sort; only defaults to `stations[0]` on initial load.
- `Nav.jsx` layout fixed — version badge is now inside the `<nav>` flex group, eliminating the `ml-auto` conflict on medium screens.
- `Home.jsx` ticker re-labelled from "DASHBOARD LIVE" to "REFERENCE DATA" to avoid misleading users.
- `About.jsx` placeholder team slots given clearer labels and an amber callout directing the team to fill them in.

### Tooling / Documentation
- `README.md` updated to use `yarn install` / `yarn start` / `yarn build` (consistent with `packageManager: yarn` in `package.json`).
- `README.md` troubleshooting section now documents the `@craco/craco@5` compatibility caveat with React 19.

## Current state
No actionable code issues remain based on the Oct 2026 full-project audit.
The app starts without requiring a pre-configured MongoDB instance and the frontend build completes successfully.
