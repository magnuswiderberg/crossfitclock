# Distribution — plan

How people find this app, and how a workout travels from one phone to the next.
Decided 2026-08-09, after weighing native app stores and finding them the wrong
tool for this product.

## Why not the app stores

Wrapping the PWA with Capacitor is maybe two days of work — an absolute `/api`
base URL, an icon set, safe areas, a native audio session — and it would buy
three real things the web can't give: beeps that ignore the iOS silent switch,
audio that survives a locked screen, and a Live Activity showing the running
segment. Those are genuine.

They are not worth it **for discovery**, which was the reason to consider it.
App stores don't market unknown apps; they convert existing intent and rank
apps that already have installs and reviews. A new interval timer with no
ratings, in a category with hundreds of them, is invisible in store search —
so the marketing work stays yours either way, with $99/year, privacy manifests,
mandatory in-app account deletion and an EU trader declaration added on top.

Meanwhile the web has the channel a native app structurally cannot reach:
**Google indexes it**. "tabata timer", "crossfit interval timer online",
"gym timer with voice countdown" are real searches, and a fast PWA can rank for
them. That door is bigger than the store door, and it's the one already open.

Revisit natively only if the silent-switch problem turns out to be what stops
people using it — that's a product reason, not a distribution one.

### What was looked at, so it isn't looked at again

- **PWA directories** (store.app, findpwa, Progressier's list) — free, five
  minutes, browsed by developers curious about PWAs rather than by anyone
  looking for a workout timer. Submit if bored; expect nothing.
- **Microsoft Store** — genuinely accepts PWAs, free individual accounts. It's
  Windows desktop. Nobody runs a gym timer on a laptop in a box.
- **Samsung Galaxy Store / Huawei AppGallery** — accept PWAs, small and
  regionally skewed, lots of account setup per install.
- **Google Play via TWA** — the only one with real consumer traffic behind it.
  Chrome renders the live PWA, ownership is verified with `assetlinks.json` on
  the domain, PWABuilder generates the package. $25 once, about an hour. Held
  back only by Play's closed-test requirement for new personal accounts (12
  testers, 14 days). **This is the one cheap experiment worth running** if store
  presence is ever worth testing — no second codebase, no Apple.

## The actual distribution mechanism: share codes

The acquisition loop is already built and wasn't framed as one. A coach running
a class off one screen who hands 20 athletes a 4-character code has just
distributed the app to 20 people — no link, no store, no account needed on the
receiving end. Everything below exists to make that loop turn faster.

### Codes on screen during and after a run

The code is only useful where the class is already looking. Two placements:

- **Run screen**, small, in the top bar next to the block/set line. Low visual
  weight — "one number dominates" still holds.
- **Finish screen**, big. Workout over, everyone catching their breath, nothing
  competing for attention. The best-attention slot in the app, previously idle.

Either role can hand a code on: an owner passes out their own (`shared`), a
recipient passes on the one they received (`origin`). But only while the
content still matches the snapshot behind that code — a code that hands someone
a *different* workout than the one on the screen is worse than no code. One
rule for both roles, `runShareCode` in `src/model/share.ts`, built on the same
fingerprints as `hasUnsharedEdits` / `hasLocalEdits`. A workout that has never
been shared has no code and shows none; creating one needs an account and the
network, which is not something to do mid-workout.

The finish screen also carries a **QR** beside the code, pointing at
`/c/<CODE>`, and the Share modal carries one under the code it just created —
the two halves of the case: a class taking the workout home, and handing it to
one person standing next to you. It is generated on the device
(`src/ui/ShareQr.tsx`) from a lazily imported encoder — nothing that runs during
a workout should carry it, and gym wifi fails exactly when it would be needed.
It draws as a single SVG path on a white plate, whose padding is the quiet zone;
on the green finish screen a QR without that plate would not scan. In dev builds
only, the modules are wrapped in an unstyled `<a>` so the target can be checked
without a second device — on a phone tapping your own QR means nothing, since
the point is that somebody *else* scans it.

Adding the QR made the Share modal taller than a short phone's screen, which
also fixed a latent bug: `.hint-overlay` centred with `align-items` and could
not scroll, so any over-tall card was clipped at both ends with its buttons out
of reach. It now scrolls, and the card centres with `margin: auto`.

### A 4-char code beats a QR at gym distances

Worth being explicit, because the instinct is to reach for a QR first: a phone
screen viewed from 3 m is too small for another phone's camera to scan, but a
4-character code in Anton is readable across the room and typed in two seconds.
The code is the primary instrument. A QR only wins up close, or when the clock
is cast to a TV or projector in the box.

## Web presence: three URLs

| URL | Serves | Audience |
| --- | --- | --- |
| `/` | Static landing page, plain HTML/CSS, no React | Google, and every link handed out |
| `/c/<CODE>` | Same shell, showing one workout and its code | QR scans, pasted links |
| `/app` | The PWA as it is today | Installed users, always |

`start_url` is `/app`, so launching from the home screen lands in the app and
never sees marketing. Scope stays `/` so the landing page can carry the install
prompt.

### Why static, not another screen in `App.tsx`

The landing page's whole job is SEO and first impressions: crawlable HTML, no
JS bundle, instant paint. Making it a React view would defeat the only reason
it exists. Vite builds it as a second entry; it imports the tokens from
`src/styles.css` for the fonts and colors without pulling in the app.

### The standalone guard

Installs made before this existed have `start_url: '/'` **baked into the home
screen icon** — on iOS the URL is captured at install time and a later manifest
change never reaches it. So the landing page redirects out of standalone mode
in its `<head>`, before paint:

```js
if (matchMedia('(display-mode: standalone)').matches || navigator.standalone)
  location.replace('/app/')
```

Cheap, permanent, and it also covers anyone who taps `/` from inside the app.

### `/c/<CODE>` points at the code, not at an import

**A QR must never auto-import.** A QR opens the system browser, whose storage
is separate from the installed PWA's — the exact reason share URLs were
rejected on 2026-08-02. Someone with the app installed would scan, be told
"added", open the app, and find nothing there.

So the page *displays* the code and names the workout. Existing users read the
code and type it into the app they already have; new users get an install path.
The typed code stays the one and only import route, and the 2026-08-02 decision
holds intact.

It needs no backend work: `GET /api/share/<code>` is already public precisely so
recipients need no account. The page is static HTML that reads the code out of
`location.pathname` and fetches it.

### Routing gotchas

- **Workbox will eat the landing page.** `vite-plugin-pwa`'s navigation
  fallback serves the app shell for *any* navigation once the service worker is
  installed — silently replacing `/` with the app on the **second** visit, which
  is easy to miss in dev. Fixed with `navigateFallback: '/app/index.html'` plus
  a denylist for `/` and `/c/`.
- Azure SWA and the Vite dev server both need `/c/*` rewritten to
  `/c/index.html`; there was no route config before this, because the app has
  no client-side routes at all (screens are React state, and history holds a
  single pushed entry).

## Next

- **The landing page has no `og:image`, and no canonical or `og:url`.** All
  three need the real domain, which isn't recorded anywhere in the repo yet.
  Add them once it is, along with a PNG social card — most scrapers reject SVG.
- **Move the install and silent-switch explanations to the landing page.** They
  currently have to interrupt people inside the app (`InstallHint.tsx`,
  `SilentHint.tsx`); the landing page is where that content wants to live.
- **A demo video of the time calls.** Ten people on one plank, a voice calling
  "thirty… one minute" while nobody can look at a screen. It's the feature the
  other hundred timers don't have, and it's 20 seconds long. Reddit
  (r/crossfit, r/homegym), box Facebook groups, coaches' Instagram.
- **Play via TWA**, if store presence is ever worth $25 to test.

## If a paid tier ever happens

Recorded here because the answer turned out to be structural rather than
commercial: the handle + sync code in `src/model/sync.ts` is already a
licensing primitive, and every request is already authenticated. A paid tier is
a flag on the Cosmos account document.

The timer itself is offline-first local JavaScript, so client-side gating is a
nudge, not enforcement. The features that *can* be enforced are the ones that
live on the server — and they're the ones that cost money to run: sync, share
code creation, and custom-label voice synthesis. Local timer, presets, bundled
clips and time calls stay free. Importing someone else's code must stay free
too; recipients with no account are how the thing spreads.

Plumbing would be a Stripe Payment Link, one webhook function setting
`plan: 'pro'` on the account, and the flag returned from `/api/account/login`.
Half a day. The genuinely annoying part is EU VAT — owed from the first krona
on digital services, with no threshold — which argues for a merchant of record
(Paddle, Polar) at ~5% over Stripe direct at ~2.9% plus quarterly OSS filings.
Worth ten minutes with Skatteverket on hobbyverksamhet vs enskild firma before
taking any money.
