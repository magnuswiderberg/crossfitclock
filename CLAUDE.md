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
  Trailing rests are trimmed so sessions end on effort. The displayed Total
  (`totalDuration`) is deliberately nominal instead: no prep countdown,
  interval rests all count, only a trailing set rest dropped — Tabata reads
  4:00 even though the actual session runs 3:55.
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
  plain HTTP on :8081) with `npm run api` + a Vite `/api` proxy.
  `api/local.settings.json` is gitignored (it's where a real Speech key goes);
  copy `api/local.settings.example.json` once — it carries the emulator's
  public key, so nothing but voice synthesis needs editing. Full plan:
  `docs/database-sync-plan.md`.
- Workout sharing is **code-only, no share URLs** (decided 2026-08-02): on
  iOS a tapped link opens Safari, whose storage is separate from the
  installed PWA's, so links import into the wrong place — a typed code works
  in both. `POST /api/share` stores a public snapshot under a 4-char code
  (same unambiguous alphabet as sync codes) in partition `share#<CODE>` of
  the existing container — point-read by code, id-uniqueness turns
  collisions into 409-reroll. Creating/listing/deleting shares requires the
  sync account (that's how "my shared codes" is owned and revocable, on the
  Sync screen); fetching by code is public, so recipients need no account.
  Re-sharing a workout keeps its code and refreshes the snapshot. Received
  workouts are rebuilt field-by-field with fresh ids
  (`parseSharedWorkout` in `src/model/share.ts`) — never trusted as-is.
- A share is a **snapshot, not a live link** (made explicit 2026-08-09):
  editing a shared workout changes nothing until it is re-shared, and pushing
  a new snapshot reaches nobody until each recipient pulls it. Both sides
  therefore store a `ShareLink { code, fingerprint }` on the workout —
  `shared` for the owner, `origin` for a recipient — where the fingerprint is
  a content signature (`shareFingerprint`, ids and local-only fields
  excluded). Comparing the current content against the stored fingerprint is
  what lets the detail screen say "edited since" offline, with no clock to
  trust and no request. Fingerprints are only ever compared **within** one
  role, so the fallbacks `parseSharedWorkout` applies don't have to match the
  sharer's. The owner's push path is just the Share modal again (its button
  reads "Update share" when there's drift); the recipient's pull is "Update
  from share", which fetches, reports if nothing changed, and otherwise
  confirms before replacing — keeping the local id, so the workout stays the
  same one to sync and to match on the next pull. Re-entering an
  already-added code on the Import screen updates that copy instead of adding
  a duplicate (`findAddedCopy`), and entering **your own** code is refused as
  nothing to import (`findOwnShare`, checked first) — matching only on
  `origin` is what silently produced two workouts under one code. Writing your
  own snapshot back over the original would revert edits made since sharing,
  so the screen points at the workout instead of offering an update; a device
  that doesn't have the workout has no link to match, so the code still
  imports there. Copy strips both links: a duplicate is its
  own workout. Revoking a code on the Sync screen clears the owner's
  `shared`. Workouts shared before this existed carry no link and show no
  status until shared once more, which restores the same code.
- Voice announcements moved from the Web Speech API to **audio clips played
  through the AudioContext** (decided and shipped 2026-08-08): on iOS, speech
  is rendered on the system speech session, so with a Bluetooth speaker
  connected the beeps follow the route and the speech comes out of the phone,
  and no web API can route it. The fixed vocabulary (Work, Rest, Get ready,
  Done) ships as MP3s in `src/audio/`, regenerated by
  `scripts/build-audio.ps1`; presets need nothing else, since no preset has an
  interval label. Custom exercise labels are synthesized on demand by
  `/api/speech` (Azure AI Speech, free F0 tier on the shared `mwse-speech`
  account) and stored content-addressed in Cosmos. Voice `en-US-AriaNeural`,
  style `excited` for work and `shouting` for rest. Clips are addressed by
  `sha256(voice|style|normalized text)`, a formula spelled out in three places
  that must change together — see the plan. Web Speech stays as the
  offline/failure fallback, and is now the only announcement path that can't
  be pre-scheduled on the audio clock. Clip bytes live in Cache Storage
  (`crossfitclock.clips.v1`), and `ensureClips` skips anything already there,
  so a workout run once makes no request on later visits. **Deployed and
  confirmed on a phone with a Bluetooth speaker** — full plan, design
  rationale and known rough edges: `docs/voice-clips-plan.md`.
- **Time calls** (decided 2026-08-09): an opt-in sound option
  (`crossfitclock.timecalls.v1`), a **peer** of the voice announcements rather
  than a sub-option — either can be on alone, because numbers without the phase
  words is a real combination for a group working off one clock. On **work
  segments only** — a rest says enough with its pitch-coded ticks. Two ladders, and
  their vocabularies are deliberately **disjoint** so a spoken number is never
  ambiguous: count-**up** milestones ("thirty", "one minute", "one thirty" …)
  always mean time served, and the "ten"/"five" run-in always means time left.
  The driving case is a group on one screen — ten people sharing a 3-minute
  plank, each with their own goal, none of them able to look. (Putting elapsed
  time on the screen was considered and rejected for that reason: it serves
  only the person holding the phone.) The count-up steps every 30 s to five
  minutes and every minute to ten, and stops 15 s before the end, which is
  what makes a 35 s interval get only the countdown while a 45 s one keeps its
  "thirty". No length floor: a guard 1.5 s after the segment start is what
  keeps short intervals sane. Every word is a bundled clip (no backend, works
  offline), and calls have **no Web Speech fallback** — a late number misleads
  someone deciding when to drop out. Policy lives in `src/engine/timecalls.ts`;
  the word list is mirrored in `scripts/build-audio.ps1`.
- The in-flight session persists to `crossfitclock.session.v1` (workout
  snapshot + wall-clock anchor) and is restored on load, so a reload or PWA
  restart drops back into the running clock. Cleared on finish/exit.
- System back (browser tab, Android PWA gesture) is handled with a single
  pushed history entry in `App.tsx` — back returns to home from any screen
  instead of leaving the app. During a run, the first back pauses the clock
  (the entry is re-pushed); a second back ends the session like Exit.

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
  If the context won't return to 'running' (iOS wedges it at 'interrupted'
  after another app, e.g. Spotify, grabs the audio session), `initAudio`
  closes it and builds a fresh one — resume() alone never recovers there.
- `navigator.audioSession.type = 'ambient'` so beeps mix with the user's
  music (Spotify/YouTube) instead of pausing or ducking it. Trade-off: iOS
  mutes ambient audio while the ringer switch is on silent. `'playback'` was
  tried and rejected (2026-08-01); the silent switch is undetectable from the
  web, so a one-time iOS hint (`src/ui/SilentHint.tsx`, localStorage
  `crossfitclock.silenthint.v2`) gates the first Start tap and stays
  reachable via a "Beeps & Silent Mode" link on the home screen (which
  deliberately does not mark the hint as seen).
