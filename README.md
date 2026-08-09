# CrossFit Clock

An interval timer PWA for Tabata and CrossFit sessions. The screen is the timer: the background color announces the phase (red = work, teal = rest, amber = get ready), a dark fill drains as time runs out, and beeps count you into every work interval.

## Features

- **Workouts** built from labeled **blocks** (Warm-up / Main / Stretch) containing labeled **sets** (e.g. 8 rounds of 20/10) of **intervals** (work + rest seconds, optional exercise name).
- Rest between rounds and rest after each set.
- Fixed countdowns: 5 s "Get ready" before the session, beeps 2 s before every work interval, a low beep at each rest, an ascending triple at the finish.
- Optional voice announcements: every interval is called as it starts — "Work", "Rest", or your own exercise label — and a rest that leads into a different exercise names it: "Rest … Next up is … Burpees" (when there is time to say it before the countdown beeps; a 3 s rest just says "Rest").
- Optional **time calls**, switched on independently of the announcements — numbers without the phase words is a real combination when the clock is across the room. A work interval counts *up* in spoken milestones — "thirty", "one minute", "one thirty" — and then runs *in* with "ten" and "five" before the final beeps. The count-up is for a group sharing one clock: on a 3-minute plank everyone has their own goal, and they can hear theirs go by without seeing the screen. The countdown is encouragement — knowing the end is close is what gets people to hold on. The two vocabularies never overlap, so a spoken number is never ambiguous: "thirty" always means time served, "ten" always means time left.
- Workout mode: full-screen color-coded timer, plate-segment round progress, next-up peek, tap to pause, screen kept awake.
- Edit mode: create, edit, duplicate, and delete workouts; presets are seeded on first launch.
- Fully offline PWA — workouts live in localStorage, fonts and assets are self-hosted.
- Optional sync across devices (edit on desktop, run on phone): claim a handle, get a sync code, connect other devices with it — no email or password. Backed by Azure Static Web Apps functions + Cosmos DB; the app works fully offline without it. See [docs/database-sync-plan.md](docs/database-sync-plan.md).
- Share workouts with a short code: tap **Share** on a workout to get a 4-character code, anyone enters it under **Add from share code** on their home screen to preview and add it — no account needed to receive. Shared codes are listed (and revocable) on the Sync screen. A shared workout carries its code on the run screen and again, in full size, on the finish screen — a class working off one clock can take the session home without writing anything down.

## Pages

Deployed at <https://workout.magnuswiderberg.se> (a placeholder domain — moving
it means editing `SITE_URL` in [vite.config.ts](vite.config.ts), which is
substituted into the canonical and Open Graph tags at build time).

The site is three separate pages, not one app with routes:

| URL | What it is |
| --- | --- |
| `/` | Static landing page — plain HTML/CSS, no React, built to be crawlable and to paint instantly |
| `/c/<CODE>` | One shared workout: what's in it, and the code to type. Deliberately does **not** import — a tapped link opens the system browser, whose storage is separate from the installed app's |
| `/app` | The PWA itself, and the manifest's `start_url` |

See [docs/distribution-plan.md](docs/distribution-plan.md) for why.

## Local development

Requires Node 20+.

```sh
npm install
npm run dev        # start the dev server (URL is printed, usually http://localhost:5173)
```

`npm run dev` opens the landing page; the app is at `/app`. The dev and preview
servers apply the same rewrites Azure Static Web Apps does, so `/c/<CODE>`
resolves locally too.

Other scripts:

```sh
npm run build      # type-check and produce a production build in dist/
npm run preview    # serve the production build locally
npm run api        # build and start the sync API locally (see below)
npm run dev:all    # dev server + sync API together, one terminal
```

### Sync API locally (optional)

The app runs fine without the API — only the Sync screen needs it. To develop
against it you need [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
and the Cosmos DB emulator (vnext) in Docker:

```sh
docker run -d -p 8081:8081 -p 1234:1234 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview
cd api && npm install && cd ..
copy api\local.settings.example.json api\local.settings.json   # once
npm run dev:all    # Functions host on :7071 + Vite dev server (proxies /api → 7071)
```

(Or separately: `npm run api` and `npm run dev` in two terminals.)

`api/local.settings.json` is gitignored, because it's where a real Speech key
would go (see the voice note below). The example it's copied from carries the
Cosmos emulator's public well-known key, so it needs no editing to run
everything but voice synthesis. The database/container are created
automatically on first use (`COSMOS_INIT=true`). The Functions host also expects
[Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
for its internal storage (`UseDevelopmentStorage=true` — without it the host
logs "Process reporting unhealthy"):

```sh
docker run -d -p 10000-10002:10000-10002 mcr.microsoft.com/azure-storage/azurite
```

## Deploy

Infrastructure is Bicep in [infra/](infra/): an Azure Static Web App (Free)
with managed functions, plus a `crossfitclock` database in an existing
Cosmos account. One script deploys infra and content:

```powershell
copy infra\deploy.local.example.json infra\deploy.local.json  # once, then fill in
.\infra\deploy.ps1
```

`infra/deploy.local.json` names the target Azure directory. It's gitignored —
those ids identify a specific tenant, so they stay out of the repo; run
`az account show` to see yours. The script refuses to deploy unless the
logged-in `az` context matches them, switching subscription on its own when it
can, so a stale login can't publish into the wrong tenant. In CI, where there's
no working tree to drop a file into, set `AZURE_TENANT_ID` and
`AZURE_SUBSCRIPTION_ID` instead.

Notes for development:

- Sound starts on the first **Start** tap (browsers require a user gesture before audio). If you hear nothing, check the tab isn't muted.
- The service worker only registers in production builds. To test PWA/offline behavior, use `npm run build && npm run preview` — and hard-refresh (Ctrl+Shift+R) if you see stale content.
- Workouts are stored under the localStorage key `crossfitclock.workouts.v1`. Clearing site data reseeds the presets.
- Voice announcements play as audio clips. The fixed vocabulary ships in `src/audio/` and needs nothing — the phase words, "Next up is" and every time-call number — so presets and time calls announce with no backend at all. Only a custom exercise label goes to `/api/speech`, which needs a `SPEECH_KEY` in `api/local.settings.json` — read one with `az cognitiveservices account keys list --name mwse-speech --resource-group rg-common --query key1 -o tsv`. Leave it empty and that label falls back to the browser's own voice, which is also the offline path, so it's worth exercising both ways. Time calls deliberately have no fallback: a late number is worse than a missing one.
- Regenerate the bundled clips with `scripts/build-audio.ps1` (needs `az` login). Its word list and the `WORDS` table in `src/engine/timecalls.ts` must stay in step — the file names are the words with spaces turned into dashes.
- To test on a phone on your network: `npm run dev -- --host`, then open the printed network URL. Wake lock and PWA install require HTTPS or localhost, so from another device those features may be unavailable in dev.

## Project structure

```
index.html    # Landing page (/)
c/index.html  # Shared-workout page (/c/<CODE>)
app/index.html# The PWA (/app)
src/
  model/      # Workout types, presets, localStorage, sync + share clients, timeline compiler
  engine/     # Session runner, Web Audio beeps, voice announcement clips, wake lock
  audio/      # The fixed clips: phase words (Work, Rest, …) and time-call numbers
  ui/         # App shell, Home, Edit, Run, and Sync screens
  site/       # The two static pages' styles and the code-page script — no React
  tokens.css  # Design tokens, shared by the app and the static pages
  styles.css  # All app styling
public/       # Copied verbatim: the icon and the Azure SWA route config
api/          # Azure Functions API (account claim/login, workout sync, share codes)
infra/        # Bicep templates and deploy script
```

The key idea: the nested Workout model exists for editing and storage. When a session starts, [`compile()`](src/model/compile.ts) flattens it into a list of timed segments (prep / work / rest / round rest / set rest), and the runner just walks that list — trailing rests are trimmed so every session ends on effort.
