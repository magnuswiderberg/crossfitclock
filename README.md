# CrossFit Clock

An interval timer PWA for Tabata and CrossFit sessions. The screen is the timer: the background color announces the phase (red = work, teal = rest, amber = get ready), a dark fill drains as time runs out, and beeps count you into every work interval.

## Features

- **Workouts** built from labeled **blocks** (Warm-up / Main / Stretch) containing labeled **sets** (e.g. 8 rounds of 20/10) of **intervals** (work + rest seconds, optional exercise name).
- Rest between rounds and rest after each set.
- Fixed countdowns: 5 s "Get ready" before the session, beeps 2 s before every work interval, a low beep at each rest, an ascending triple at the finish.
- Workout mode: full-screen color-coded timer, plate-segment round progress, next-up peek, tap to pause, screen kept awake.
- Edit mode: create, edit, duplicate, and delete workouts; three presets are seeded on first launch.
- Fully offline PWA — workouts live in localStorage, fonts and assets are self-hosted.

## Local development

Requires Node 20+.

```sh
npm install
npm run dev        # start the dev server (URL is printed, usually http://localhost:5173)
```

Other scripts:

```sh
npm run build      # type-check and produce a production build in dist/
npm run preview    # serve the production build locally
```

Notes for development:

- Sound starts on the first **Start** tap (browsers require a user gesture before audio). If you hear nothing, check the tab isn't muted.
- The service worker only registers in production builds. To test PWA/offline behavior, use `npm run build && npm run preview` — and hard-refresh (Ctrl+Shift+R) if you see stale content.
- Workouts are stored under the localStorage key `crossfitclock.workouts.v1`. Clearing site data reseeds the presets.
- To test on a phone on your network: `npm run dev -- --host`, then open the printed network URL. Wake lock and PWA install require HTTPS or localhost, so from another device those features may be unavailable in dev.

## Project structure

```
src/
  model/      # Workout types, presets, localStorage, and the timeline compiler
  engine/     # Session runner (performance.now-based), Web Audio beeps, wake lock
  ui/         # App shell, Home, Edit, and Run screens
  styles.css  # Design tokens and all styling
```

The key idea: the nested Workout model exists for editing and storage. When a session starts, [`compile()`](src/model/compile.ts) flattens it into a list of timed segments (prep / work / rest / round rest / set rest), and the runner just walks that list — trailing rests are trimmed so every session ends on effort.
