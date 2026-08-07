# Database sync — plan

Sync workouts across devices (edit on desktop, run on phone) via a small
backend, while the app stays fully offline-first: localStorage remains the
source of truth and the timer never depends on the network.

## Architecture

- **Hosting**: Azure Static Web Apps (Free tier) in `rg-static-sites`,
  serving the PWA plus managed Azure Functions under `/api/*` (same origin, no
  CORS). The SWA itself sits in East US 2; West Europe would be closer to the
  Sweden Central Cosmos account but is closed to new customers.
- **Database**: existing Cosmos DB account `mwse-cosmos` in `rg-common`. A new
  SQL database `crossfitclock` with one container `data` (partition key
  `/handle`), provisioned at the 400 RU/s minimum — the account is free-tier
  (provisioned, not serverless), so that sits inside the free 1000 RU/s.
  The account had `disableLocalAuth: true`; it was turned off because SWA
  *managed* functions have no managed identity, so key auth is the only way in.
- **Local dev**: Cosmos emulator (vnext) in Docker at `http://localhost:8081`
  (plain HTTP, well-known key), Functions via Core Tools on port 7071, Vite
  dev server proxies `/api` → `localhost:7071`.
- **Infra as code**: Bicep in `infra/`, deployed with `infra/deploy.ps1`.
  The Cosmos database/container is created cross-resource-group via a module
  scoped to `rg-common`; the Cosmos key is injected into SWA function
  app settings at deploy time via `listKeys`.

## Identity: handle + sync code (no email)

Security is explicitly not a prime concern; the secret only prevents
accidental/naïve overwrites of someone else's data.

1. User claims a nickname (handle). Server generates a short secret
   ("sync code", e.g. `K7QM2X`), stores only a salted scrypt hash, and returns
   it once. Handle + secret persist in localStorage.
2. On another device the user enters handle + code once ("connect").
3. All API calls carry `x-cfc-handle` / `x-cfc-secret` headers.

Handle rules: `^[a-z0-9][a-z0-9-]{2,19}$` (lowercased client-side).
Lost code + lost devices ⇒ handle is orphaned; acceptable for a hobby app
(recovery flow is a possible later addition).

## Sync model: last-write-wins per workout, with tombstones

- `Workout` gets `updatedAt` (epoch ms), stamped on every save. Presets are
  never synced (they're code, reseeded per device).
- Deletions are recorded as tombstones (`{id, deletedAt}`) in local sync
  state, so a delete on one device doesn't resurrect from the other.
- One endpoint does everything: client POSTs its user workouts + tombstones,
  server merges LWW per workout id against the stored docs, upserts what the
  client had newer, and returns the full merged set (incl. tombstones).
  Client replaces its user workouts with the result and prunes tombstones.
- Sync triggers: app load, after each save/delete (fire-and-forget), and
  manual "Sync now". Failures are silent in the background (offline is
  normal), visible only on the Sync screen.

## Cosmos documents (container `data`, pk `/handle`)

```jsonc
// account:  id = "account"
{ "id": "account", "handle": "magnus", "type": "account",
  "secretHash": "<sha256 hex>", "createdAt": 1690000000000 }

// workout:  id = "w-<workoutId>"; on delete workout=null, deleted=true
{ "id": "w-abc123", "handle": "magnus", "type": "workout",
  "updatedAt": 1690000000000, "deleted": false, "workout": { /* Workout */ } }
```

## API (Functions v4, TypeScript, `api/`)

| Route | Body | Result |
|---|---|---|
| `POST /api/account/claim` | `{handle}` | `201 {handle, secret}` · `409` taken · `400` invalid |
| `POST /api/account/login` | `{handle, secret}` | `204` · `401` |
| `POST /api/sync` | `{workouts: [{workout, updatedAt, deleted?}]}` + auth headers | `200 {workouts: [...]}` merged set · `401` |

`api/src/shared/cosmos.ts` reads `COSMOS_ENDPOINT`/`COSMOS_KEY`;
`COSMOS_INIT=true` (local only) creates the database/container on first use —
in Azure, Bicep creates them.

## Client

- `src/model/sync.ts`: sync config in localStorage
  (`crossfitclock.sync.v1`: `{handle, secret, tombstones, lastSyncAt}`),
  API wrappers, and `syncWorkouts(local) → merged` used by App.
- `App.tsx`: stamps `updatedAt` on save, records tombstones on delete,
  fires background sync on load and after mutations.
- New `SyncScreen` (view `sync`), entered from a small button on Home.
  States: not connected (create handle / connect existing) and connected
  (handle, last sync, Sync now, Disconnect). Disconnect only forgets the
  device's credentials — data stays local and remote.

## Out of scope (possible later)

- GitHub Actions CI deploy (deploy script is manual for now).
- Handle recovery (e.g. via email), multi-user sharing, realtime.
- Syncing the in-flight session.
