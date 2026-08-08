# Voice clips — plan

Replace Web Speech announcements with pre-rendered audio clips played through
the same `AudioContext` as the beeps, so announcements come out of whatever
device the beeps do.

## Why

On iOS, `speechSynthesis` is rendered by the system speech service on its own
audio session. Web Audio follows the app's session and therefore the connected
Bluetooth route; speech does not, and lands on the phone speaker. There is no
web API to route it (no `setSinkId` in iOS Safari, no output selection in the
Web Speech API). Observed in the wild with a group: music and beeps on the
speaker, "Work" / "Rest" from the phone in someone's pocket.

Playing announcements as decoded `AudioBuffer`s through the existing
compressor node fixes routing, and brings two things for free:

- **Background survival.** Clips can be pre-scheduled on the audio clock like
  the beeps, so they no longer go silent when rAF is throttled — the
  limitation documented at the top of `src/engine/speech.ts` disappears.
- **A consistent voice** across devices, instead of whatever the browser's
  voice list happens to offer.

## Architecture

```
Editor Save ──► POST /api/speech {texts:[…]} ──► for each text:
                                                  hash → blob exists? ─ yes ─► url
                                                                     └─ no ──► Azure AI Speech
                                                                               → upload blob → url
                     ◄── {clips:[{text,url}]} ───┘
Client: fetch url → decodeAudioData → cache (memory + Cache Storage) → schedule on AudioContext
```

- **TTS**: Azure AI Speech (`Microsoft.CognitiveServices/accounts`, kind
  `SpeechServices`). Same subscription and Bicep as the rest; F0 tier gives
  0.5M characters/month free, and an announcement is ~10 characters. REST
  synthesis straight to MP3 (`audio-24khz-48kbitrate-mono-mp3`, ~4 KB/word).
  Voice: one fixed neural voice, pinned in config so it can be changed
  without invalidating anything (the voice id is part of the blob key).
- **Storage**: Blob Storage container `clips`, anonymous read, content-addressed
  `clips/<voice>/<sha256(normalizedText)>.mp3` with
  `Cache-Control: public, max-age=31536000, immutable`. CORS allows the SWA
  origin. Content addressing makes generation idempotent — the same text from
  any user is the same blob, which is the sharing the feature wants.
  Serving blobs directly rather than proxying through `/api/clip/<hash>` keeps
  clips cacheable by the service worker and costs no function invocations.
- **Normalization** (before hashing): trim, collapse whitespace, lowercase.
  So "Burpees", "burpees " and "BURPEES" are one clip.

## API

`POST /api/speech` — anonymous (recipients of a shared workout have no
account), idempotent, safe to retry.

```jsonc
// request
{ "texts": ["Work", "Rest", "Burpees", "Wall balls"] }
// response
{ "clips": [ { "text": "Work", "url": "https://…/clips/v1/ab12….mp3" },
             { "text": "Burpees", "status": "failed" } ] }
```

Abuse/spend limits, since this turns arbitrary user text into paid synthesis:

- ≤ 40 characters per text, ≤ 20 texts per request, printable characters only.
- Per-IP rate limit, and a monthly character budget cap in config; over
  budget the endpoint returns `status: "failed"` per clip and the client
  falls back to Web Speech rather than erroring.

## Client

- `src/engine/speech.ts` becomes a clip player: resolve text → `AudioBuffer`
  (memory cache → Cache Storage → network), schedule through a new
  `playBuffer(buffer, delay)` in `audio.ts` so it shares the compressor and
  the session's audio route. Session start pre-schedules the whole run's
  announcements next to the beeps.
- **Fallback stays.** Missing clip (offline, generation failed, budget hit)
  → `speechSynthesis` exactly as today. Worse routing beats silence.
- The vocabulary of a workout is what `compile()` can announce: `"Rest"` plus
  each work segment's label (`interval.label` or `"Work"`). Adding
  `"Get ready"`, `"Set rest"` and `"Done"` is nearly free and makes the prep
  and finish segments speak too.
- Fixed vocabulary (`Work`, `Rest`, `Set rest`, `Get ready`, `Done`, plus every
  preset's labels) is pre-warmed at deploy, so a new user's first workout has
  no generation wait at all.

## Generation trigger

Generation runs on **Save in the editor**, on **import of a shared workout**,
and on first load for presets (a no-op once pre-warmed). It never blocks:
Save writes to localStorage and returns immediately, with a non-modal progress
line ("Preparing audio 2/5"). Failures are silent and retried the next time
the workout is opened or run.

Not opt-in, and not conditioned on the announcements toggle — see the
reasoning in CLAUDE.md's decisions log.

## Privacy note

Clips are shared across users and derived from text a user typed. They are
content-addressed and unlisted, so finding one requires knowing the text
already; the container is never enumerable. Nothing ties a clip to an account.

## Infra changes

- `infra/main.bicep`: add the Speech account and Storage account, wire
  `SPEECH_KEY` / `SPEECH_REGION` / `BLOB_CONNECTION` into SWA app settings the
  same way the Cosmos key is (resolved at deploy time via `listKeys`).
- `api/package.json`: add `@azure/storage-blob`.
- Local dev: Azurite for blobs; a `SPEECH_KEY` in `local.settings.json`, or
  a stub that returns a beep-length silent MP3 when the key is absent.
