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
- Sets support both `restBetweenRounds` and `restAfterSet`.
- Countdowns are hardcoded: 5 s get-ready before the session
  (`PREP_SECONDS`), beeps 2 s before each work interval
  (`COUNTDOWN_SECONDS`) — see `src/model/types.ts`.
- The nested model is for editing/storage only; `compile()` in
  `src/model/compile.ts` flattens it to a segment timeline the runner walks.
  Trailing rests are trimmed so sessions end on effort.
- Storage: localStorage key `crossfitclock.workouts.v1`; presets reseed when
  it's empty. A remote backend (e.g. Supabase) is a possible later addition.

## Working notes

- Open todos and feature ideas live in `initials/todos.md` (the `initials/`
  folder is gitignored reference material — the original prompt and design
  pitch live there too).
- Known refinement: beeps fire from the rAF loop; pre-scheduling them on the
  AudioContext clock would survive tab throttling.
