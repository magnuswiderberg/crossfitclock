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
clean dark UI. Fonts: Anton (display/digits), Archivo (UI), self-hosted from
`src/fonts/`. All tokens live in `src/tokens.css`.

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
  `infra/` (`deploy.ps1`; `-Environment <name>` deploys to a SWA preview
  environment instead of production — see README); local dev uses the Docker Cosmos emulator (vnext,
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
- **Static pages, not one app** (decided 2026-08-09): `/` is a landing page and
  `/help` is the help/tips page (both plain HTML/CSS, no React — their job is
  to be crawlable and paint instantly), `/c/<CODE>` shows one shared workout,
  and the PWA lives at `/app`, which is the manifest's `start_url`. Manifest `id` stays `'/'` so
  existing installs don't read as a different app, and the landing page
  redirects out of `display-mode: standalone` before paint, because iOS bakes
  `start_url` into the home-screen icon at install time. `/c/<CODE>`
  deliberately **does not import** — a tapped link or scanned QR opens the
  system browser, whose storage is separate from the installed PWA's (the
  2026-08-02 reasoning) — it displays the code to be typed instead. Two
  traps: Workbox's navigation fallback silently serves the app shell in place
  of the landing page from the *second* visit (hence
  `navigateFallbackDenylist`), and `/c/*` + bare `/app` need rewriting in
  `public/staticwebapp.config.json` and in a Vite middleware so dev, preview
  and production agree. Canonical/Open Graph tags must be absolute (scrapers
  don't run JS), so `%SITE_URL%` is substituted at build time from `SITE_URL`
  in `vite.config.ts` — currently the placeholder host
  `https://workout.magnuswiderberg.se`, and the one edit a domain move needs.
  `/app` and `/c/<CODE>` are `noindex`; the h1 on `/` stays brand, with the
  search terms carried by the title, lede and the formats section instead.
  The social card `public/og-image.png` repeats the h1, so it is rendered
  from `scripts/og-card.html` by `scripts/build-og.ps1` — re-run after a
  headline change. Rationale, and why native app stores were rejected:
  `docs/distribution-plan.md`.
- **English only** (decided 2026-08-22): the site, the app and the voice
  clips. Swedish, if it ever happens, is separate pages — never mixed
  sentences — so nothing in the copy or the clip vocabulary should hedge
  toward bilingual.
- Share code **7K4M is a real, seeded share** (the example printed on the
  landing page and carried in the finish-screen QRs), written by
  `api/scripts/seed-share.mjs` from `deploy.ps1`. Its `owner` is `__seed__`,
  unclaimable on purpose — `owner` gates listing and deleting a share, and
  `HANDLE_RE` rejects underscores, so nobody can claim the handle and revoke
  it.
- The share code appears **on the run screen** (corner, quiet) and **on the
  finish screen** (full size) — the acquisition loop is a class taking the
  workout home. `runShareCode` shows the owner's `shared` code or a
  recipient's `origin` code, but only while the content still matches that
  snapshot's fingerprint: a code handing someone a different workout than the
  one on screen is worse than no code, and a run screen has no room to explain
  drift. The finish screen and the Share modal both draw a **QR** for
  `/c/<CODE>` (`src/ui/ShareQr.tsx`) from a lazily imported encoder, on a white
  plate whose padding is the quiet zone — on the green finish screen a bare QR
  won't scan. In dev only it's wrapped in an unstyled `<a>`, to check the target
  without a second device. `.hint-overlay` scrolls (and centers its card with
  `margin: auto`) because the QR pushed the Share modal past a short phone's
  screen, where it used to clip its own buttons.
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
- **Next up** (decided 2026-08-22): a rest announces the exercise it leads
  into — "Rest … Next up is … Burpees" — when that is a labeled work interval
  **and a different one** from what was just done (a Tabata of burpees still
  just says "Rest"; the call marks a change). No toggle: it rides on voice
  announcements. The one case against it, very short rests, is handled by a
  **fit rule** instead of an opt-out — the phrase is scheduled only if its last
  word ends before the countdown ticks begin (`announcePhrase` in
  `src/engine/speech.ts`, room = rest − `COUNTDOWN_SECONDS`), which in practice
  means rests of about 5 s and up; shorter ones keep "Rest" alone, because a
  name that lands as the work starts prepares no one and talks over the ticks.
  "Next up is" is a bundled clip in the `excited` style, so it matches the
  label clip that follows — the same clip the work interval announces with,
  so nothing extra is synthesized. Words are sequenced by their spoken bounds,
  not buffer length: Azure pads every clip to 1.6–2.2 s for well under a
  second of speech (`clipBounds` in `src/engine/audio.ts`). Clip-only, no Web
  Speech fallback, all-or-nothing.
- **Sound levels** (2026-08-22): clips are peak-normalized at play time and
  pushed `VOICE_BOOST` (×3) into the master compressor — at unity a spoken
  word's body sat ~10 dB under the near-full-scale beeps and was lost behind
  music. Ducking the music instead is not available to the web: `'transient'`
  is the only Audio Session type that even mentions ducking ("maybe"), and
  WebKit maps it to the same category as `'ambient'`. The chain is
  compressor → **hard limiter** (−2 dB, 20:1) → destination: the compressor
  sets loudness (its makeup gain is what lifts the voice's body, so its ratio
  stays gentle) and the limiter owns the ceiling. The limiter exists because
  the go beep under a label's first syllable already summed to full scale, so
  beeps could not come up without it; with it, `BEEP_LEVEL` 1.5 / `BEEP_ACCENT`
  1.7 (from 0.9 / 1.0). Beeps are flat tones, so they are at the ceiling by
  construction — more level is no longer available, only more sustain or
  harmonics.
- The in-flight session persists to `crossfitclock.session.v1` (workout
  snapshot + wall-clock anchor) and is restored on load, so a reload or PWA
  restart drops back into the running clock. Cleared on finish/exit.
- System back (browser tab, Android PWA gesture) is handled with a single
  pushed history entry in `App.tsx` — back returns to home from any screen
  instead of leaving the app. During a run, the first back pauses the clock
  (the entry is re-pushed); a second back ends the session like Exit.
- **Fonts** (2026-08-23): Anton 400 and Archivo 400/600/700 are vendored as
  latin-only woff2 in `src/fonts/`, with the `@font-face` rules owned by
  `src/tokens.css` — `font-display: block`, not Fontsource's `swap`, which
  painted every launch in Arial Narrow and then jumped to Anton. All four HTML
  entries preload them (Vite rewrites the `/src/fonts/…` hrefs to the same
  hashed URLs the CSS uses) and the service worker precaches them (`woff2` in
  `globPatterns`) — they were the one asset left out, so every launch fetched
  them over the network. Hashed `/assets/*` get `Cache-Control: immutable`
  from a headers route in `public/staticwebapp.config.json`; SWA's default is
  `must-revalidate, max-age=30` on everything, one revalidation round trip per
  launch. Lighthouse flags `block`, but with the preload the cold-visit wait is
  a single round trip, and a brief blank beats a digit font that swaps.

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
- The in-app hints (`SilentHint.tsx`, and the manual install instructions in
  `InstallHint.tsx`) are one sentence plus a link to the matching `/help/#…`
  section (`src/ui/HelpLink.tsx`, trimmed 2026-08-23); the full explanations
  live on the help page. Help links open an in-app overlay
  (`src/ui/HelpOverlay.tsx`, added 2026-08-24): an iframe of `/help/#…`, which
  the service worker answers from precache, so it works offline — the old
  `target="_blank"` tab on an installed iPhone was Safari's sheet, whose cache
  is not the app's, and could not. The framed page hides its own site chrome
  and unwraps its links into the app (`html.embedded`: inline script in
  `help/index.html`, rules at the end of `src/site/site.css`); a modified
  click still opens the real page in a tab. `HelpFooterLink` puts the same
  overlay behind the quiet links at the bottom of the Home, Add-workout and
  Sync screens.
