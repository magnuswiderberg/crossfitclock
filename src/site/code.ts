import { fetchShare, normalizeCode, ShareNotFoundError } from '../model/share'
import { formatTime, totalDuration } from '../model/compile'
import type { Workout } from '../model/types'

/**
 * `/c/<CODE>` — the landing page for one shared workout, and the target a QR
 * code points at.
 *
 * It deliberately does **not** import anything. A tapped link or a scanned QR
 * opens the system browser, whose storage is separate from the installed PWA's
 * — the reason share URLs were rejected in the first place. Someone with the
 * app installed would be told "added" here and then find nothing there. So the
 * page shows what the code contains and hands the code over to be typed, which
 * is the one import route that works in both places.
 *
 * Everything rendered here came from a stranger via a public code, so it goes
 * in as `textContent`, never as markup. `parseSharedWorkout` (inside
 * `fetchShare`) has already rebuilt and clamped the structure.
 */

const root = document.getElementById('root')!

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** The code out of `/c/<CODE>`, falling back to `/c/?code=<CODE>`. */
function codeFromLocation(): string {
  const last = location.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const raw = /^c$/i.test(last) ? (new URLSearchParams(location.search).get('code') ?? '') : last
  try {
    return normalizeCode(decodeURIComponent(raw))
  } catch {
    return normalizeCode(raw) // malformed percent-escapes — normalize drops them anyway
  }
}

function summarize(workout: Workout): string {
  const sets = workout.blocks.reduce((n, b) => n + b.sets.length, 0)
  return `${sets} ${sets === 1 ? 'set' : 'sets'} · ${formatTime(totalDuration(workout))}`
}

function outline(workout: Workout): HTMLElement {
  const wrap = el('section', 'code-outline')
  wrap.append(el('h2', undefined, 'What’s in it'))

  for (const block of workout.blocks) {
    if (workout.blocks.length > 1) wrap.append(el('h2', undefined, block.label))

    for (const set of block.sets) {
      const card = el('div', 'code-set')
      const head = el('div', 'code-row head')
      head.append(
        el('span', undefined, set.label),
        el('span', 'times', `${set.rounds} ${set.rounds === 1 ? 'round' : 'rounds'}`),
      )
      card.append(head)

      for (const iv of set.intervals) {
        const row = el('div', 'code-row')
        row.append(
          el('span', undefined, iv.label?.trim() || 'Work'),
          el(
            'span',
            'times',
            formatTime(iv.work) + (iv.rest > 0 ? ` · rest ${formatTime(iv.rest)}` : ''),
          ),
        )
        card.append(row)
      }

      if (set.restAfterSet > 0) {
        const row = el('div', 'code-row')
        row.append(el('span', undefined, 'Set rest'), el('span', 'times', formatTime(set.restAfterSet)))
        card.append(row)
      }

      wrap.append(card)
    }
  }
  return wrap
}

function steps(): HTMLElement {
  const wrap = el('section', 'code-steps')

  const have = el('div', 'code-step')
  have.append(
    el('h2', undefined, 'Already have CrossFit Clock?'),
    el(
      'p',
      undefined,
      'Open it, tap Import, and type the code above. Typing it is the point — a workout added ' +
        'here in the browser wouldn’t show up in the app on your home screen.',
    ),
  )
  const openApp = el('a', 'btn', 'Open the clock') as HTMLAnchorElement
  openApp.href = '/app/'
  have.append(openApp)

  const isNew = el('div', 'code-step')
  isNew.append(
    el('h2', undefined, 'New here?'),
    el(
      'p',
      undefined,
      'CrossFit Clock is a free interval timer for Tabata and CrossFit — readable across the ' +
        'gym, it calls the time out loud, and it runs offline. Add it to your phone, then come ' +
        'back and type the code.',
    ),
  )
  const learn = el('a', 'btn btn-primary', 'What is this?') as HTMLAnchorElement
  learn.href = '/'
  isNew.append(learn)

  wrap.append(have, isNew)
  return wrap
}

function showError(heading: string, detail: string): void {
  root.replaceChildren()
  const wrap = el('section', 'code-error')
  const openApp = el('a', 'btn btn-primary', 'Open the clock') as HTMLAnchorElement
  openApp.href = '/app/'
  wrap.append(el('h1', undefined, heading), el('p', undefined, detail), openApp)
  root.append(wrap)
}

function render(code: string, workout: Workout): void {
  root.replaceChildren()

  const hero = el('section', 'code-hero')
  hero.append(
    el('span', 'eyebrow', 'Shared workout'),
    el('h1', undefined, workout.name),
    el('p', 'code-meta', summarize(workout)),
    el('p', 'code-big', code),
  )
  root.append(hero)

  if (workout.description) {
    root.append(el('p', 'code-note', workout.description))
  }

  root.append(steps(), outline(workout))
  root.append(
    el(
      'p',
      'code-note',
      'A share is a snapshot, not a live link: if the person who shared this edits it later, ' +
        'your copy stays as it is until you ask for the update.',
    ),
  )

  document.title = `${workout.name} · code ${code} — CrossFit Clock`
}

async function main(): Promise<void> {
  const code = codeFromLocation()
  if (!code) {
    showError('No code in this link', 'A share link looks like /c/7K4M. Check the code and try again.')
    return
  }

  try {
    render(code, await fetchShare(code))
  } catch (err) {
    if (err instanceof ShareNotFoundError) {
      showError(
        `Nothing shared as ${code}`,
        'The code may have been revoked, or mistyped. Ask whoever shared it for a fresh one.',
      )
      return
    }
    showError(
      'Could not reach the share server',
      err instanceof Error ? err.message : 'Check your connection and try again.',
    )
  }
}

void main()
