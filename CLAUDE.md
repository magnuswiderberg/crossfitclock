# CrossFit Clock — project context

Interval timer PWA for Tabata/CrossFit sessions. See [README.md](README.md) for
features, local dev instructions, and project structure.

## Product principles

- Very easy to use during a workout: glanceable from 3 m, one number dominates,
  color announces phase before you read anything.
- Fancy features stay hidden behind menus — the default flow is pick → start.
- Two modes only: workout (run) mode and edit mode.

## Design direction (decided, don't re-litigate)

"Signal": the whole screen is the timer. Background color = phase
(work #E23D28 red, rest #0E7C7B teal, get-ready #E8A33D amber, done #158B45
green), a dark fill drains down as the segment elapses, and the final-2s
countdown flashes the screen in sync with the beeps. Round progress uses a
plate-segment bar (borrowed from a rejected "Plates" direction). Editor is a
clean dark UI. Fonts: Anton (display/digits), Archivo (UI), self-hosted via
Fontsource. All tokens live in `src/styles.css`.

Design pitch with all three explored directions:
https://claude.ai/code/artifact/f9493707-f78e-4004-8377-cba3b34e32bb
(A "Scoreboard" LED look was shelved as a possible future unlockable theme.)

## Decisions log

- Naming: a saved definition is a **Workout**; running one is a **Session**.
- Hierarchy: Workout → Blocks → Sets → Intervals. Labels are required on
  blocks and sets, optional on intervals.
- Sets have a single `restAfterSet` (rest after the set/block). Rest between
  rounds is expressed via the last interval's own `rest`, which fires at the
  end of every round — a separate `restBetweenRounds` was removed as
  redundant.
- Countdowns are hardcoded: 5 s get-ready before the session
  (`PREP_SECONDS`), beeps 2 s before each work interval
  (`COUNTDOWN_SECONDS`) — see `src/model/types.ts`.
- The nested model is for editing/storage only; `compile()` in
  `src/model/compile.ts` flattens it to a segment timeline the runner walks.
  Trailing rests are trimmed so sessions end on effort.
- Storage: localStorage key `crossfitclock.workouts.v1`; presets reseed when
  it's empty. Presets carry `preset: true` and are read-only in the UI (no
  edit/delete — Copy is the customize path); `loadWorkouts` re-flags legacy
  stored presets by name, and Copy opens the duplicate straight in the editor
  as a new workout (only saved on Save).
- Sync backend (chosen over Supabase — no 7-day free-tier pause, account
  already existed): Azure Static Web Apps managed functions (`api/`) + a
  serverless Cosmos DB. Identity is a claimed **handle + server-generated
  sync code** (no email); the code's SHA-256 lives in Cosmos, the code itself
  in localStorage (`crossfitclock.sync.v1`, with deletion tombstones).
  Sync is offline-first, last-write-wins per workout via `updatedAt`, one
  `POST /api/sync` round trip; presets never sync. Infra is Bicep in
  `infra/` (`deploy.ps1`); local dev uses the Docker Cosmos emulator (vnext,
  plain HTTP on :8081) with `npm run api` + a Vite `/api` proxy. Full plan:
  `docs/database-sync-plan.md`.
- The in-flight session persists to `crossfitclock.session.v1` (workout
  snapshot + wall-clock anchor) and is restored on load, so a reload or PWA
  restart drops back into the running clock. Cleared on finish/exit.

## Working notes

- Open todos and feature ideas live in `initials/todos.md` (the `initials/`
  folder is gitignored reference material — the original prompt and design
  pitch live there too).
- Sessions are anchored to a single `Date.now()` epoch (not
  `performance.now()`, which can freeze during device sleep); the current
  segment is derived from total elapsed each tick.
- Beeps are pre-scheduled on the AudioContext clock (whole session up front,
  cancelled/rescheduled on pause/resume/restart), so they survive rAF
  throttling in background tabs. They are re-anchored on
  `visibilitychange → visible` (the audio clock stalls while the OS suspends
  it) and on the first tap after a reload (audio needs a user gesture).
- `navigator.audioSession.type = 'ambient'` so beeps mix with the user's
  music (Spotify/YouTube) instead of pausing or ducking it. Trade-off: iOS
  mutes ambient audio while the ringer switch is on silent.
