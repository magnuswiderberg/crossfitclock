import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Segment } from '../model/compile'
import { COUNTDOWN_SECONDS } from '../model/types'
import {
  audioRunning,
  beepCountdown,
  beepCountdownRest,
  beepFinish,
  beepGo,
  beepRest,
  cancelScheduledSounds,
  initAudio,
} from './audio'
import {
  announcementFor,
  announcementsIn,
  callsFor,
  callVocabularyIn,
  FINISH_ANNOUNCEMENT,
} from './clips'
import {
  announce,
  cancelAnnouncements,
  prepareAnnouncements,
  primeSpeech,
  timeCallsEnabled,
} from './speech'

export type SessionStatus = 'running' | 'paused' | 'done'

export interface SessionSnapshot {
  status: SessionStatus
  index: number
  /** Seconds left in the current segment (fractional, for smooth fills). */
  remaining: number
  /** 0..1 elapsed fraction of the current segment. */
  progress: number
  elapsedTotal: number
  /** True during the final countdown beeps before a work interval. */
  countdownActive: boolean
}

export interface SessionControls {
  pause: () => void
  resume: () => void
  restart: () => void
  /** Jump to the start of the next segment (or finish, on the last one). */
  skip: () => void
  /**
   * Dev-only: jump to just before the next sound moment (countdown + boundary
   * beep), so repeated presses walk the session sound-to-sound in real time.
   */
  devJump: () => void
}

/** Wall-clock anchor of a session — enough to restore it after a reload. */
export interface SessionRestore {
  /** Epoch ms when segment 0 started (shifted forward for time spent paused). */
  startedAt: number
  /** Epoch ms when the session was paused, or null if it was running. */
  pausedAt: number | null
}

export interface SessionOptions {
  /** Resume a previously persisted session instead of starting fresh. */
  restore?: SessionRestore
  /** Called whenever the anchor changes; null when the session finishes. */
  onPersist?: (state: SessionRestore | null) => void
}

/**
 * Walks the compiled timeline. The session is anchored to a single Date.now()
 * epoch and the current segment is derived from total elapsed time, so the
 * clock survives rAF throttling, device sleep, and even a page reload (via
 * restore/onPersist). Sound is not fired from the rAF loop: the whole session's
 * beeps and voice announcements are pre-scheduled on the AudioContext clock,
 * and re-anchored whenever that clock may have stalled (tab shown again, audio
 * unlocked).
 */
export function useSession(
  segments: Segment[],
  opts?: SessionOptions,
): [SessionSnapshot, SessionControls, boolean] {
  const totals = useMemo(() => {
    let acc = 0
    const starts = segments.map((s) => {
      const v = acc
      acc += s.duration
      return v
    })
    return { starts, total: acc }
  }, [segments])

  const persistRef = useRef(opts?.onPersist)
  persistRef.current = opts?.onPersist

  // Frozen at first render: restore describes a moment, not a live input.
  const [restore] = useState(() => opts?.restore ?? null)

  // True while the AudioContext can't run and beeps are lost — after a
  // reload (no gesture yet) or when iOS wedged the context while another
  // app held the audio session. The UI prompts for the tap that fixes it.
  const [audioBlocked, setAudioBlocked] = useState(false)

  /** Segment position at `elapsed` seconds into the session; null = finished. */
  const locate = useCallback(
    (elapsed: number) => {
      if (elapsed >= totals.total || segments.length === 0) return null
      let index = 0
      while (index + 1 < segments.length && totals.starts[index + 1] <= elapsed) index++
      return { index, remaining: totals.starts[index] + segments[index].duration - elapsed }
    },
    [segments, totals],
  )

  const [snap, setSnap] = useState<SessionSnapshot>(() => {
    const startedAt = restore?.startedAt ?? Date.now()
    const elapsed = restore ? ((restore.pausedAt ?? Date.now()) - startedAt) / 1000 : 0
    const loc = locate(elapsed)
    if (!loc) {
      return {
        status: 'done',
        index: Math.max(0, segments.length - 1),
        remaining: 0,
        progress: 1,
        elapsedTotal: totals.total,
        countdownActive: false,
      }
    }
    return {
      status: restore?.pausedAt != null ? 'paused' : 'running',
      index: loc.index,
      remaining: loc.remaining,
      progress: 1 - loc.remaining / segments[loc.index].duration,
      elapsedTotal: elapsed,
      countdownActive: false,
    }
  })

  const ref = useRef({
    status: 'running' as SessionStatus,
    startMs: 0,
    pausedAtMs: 0,
    raf: 0,
  })

  /** Index of the segment whose announcement moment has passed. */
  const spokenRef = useRef(-1)
  // Announcements stay off until their clips are decoded, so the first
  // scheduling pass doesn't announce through the Web Speech fallback while the
  // real clips are still a few milliseconds away.
  const clipsReadyRef = useRef(false)

  /**
   * Queue every remaining sound in the session on the audio clock, starting
   * from `remaining` seconds left in segment `index`. Countdown beeps whose
   * moment has already passed (resume mid-countdown) are skipped.
   */
  const scheduleSounds = useCallback(
    (index: number, remaining: number) => {
      cancelScheduledSounds()
      cancelAnnouncements()

      // The segment we're already in gets no boundary sound below, so its
      // announcement happens here — but only when it is genuinely starting
      // (a restart, or a skip landing on it). Re-anchoring mid-segment must
      // not repeat what was already said.
      const current = segments[index]
      if (
        clipsReadyRef.current &&
        current &&
        remaining > current.duration - 0.6 &&
        spokenRef.current !== index
      ) {
        spokenRef.current = index
        announce(announcementFor(current))
      }

      const callsOn = clipsReadyRef.current && timeCallsEnabled()
      let boundary = remaining
      for (let i = index; i < segments.length; i++) {
        if (i > index) boundary += segments[i].duration
        const next = segments[i + 1]
        // Time calls are placed from the segment's start, which for the
        // segment we are already in is behind us — so the same negative-delay
        // skip the countdown ticks use drops the ones that have passed.
        if (callsOn) {
          const start = boundary - segments[i].duration
          for (const { item, at } of callsFor(segments[i])) {
            if (start + at >= 0) announce(item, start + at)
          }
        }
        // Every boundary gets the same lead-in ticks, high before an effort
        // (work, and the finish that ends the last one) and a third lower
        // before a rest — so the pitch says which one is coming.
        const tick = !next || next.type === 'work' ? beepCountdown : beepCountdownRest
        for (let s = COUNTDOWN_SECONDS; s >= 1; s--) {
          if (boundary - s >= 0) tick(boundary - s)
        }
        if (!next) beepFinish(boundary)
        else if (next.type === 'work') beepGo(boundary)
        else beepRest(boundary)
        if (clipsReadyRef.current) {
          announce(next ? announcementFor(next) : FINISH_ANNOUNCEMENT, boundary)
        }
      }
    },
    [segments],
  )

  /** Re-anchor all pending sound to the current wall-clock position. */
  const rescheduleSounds = useCallback(() => {
    const r = ref.current
    if (r.status !== 'running') return
    const loc = locate((Date.now() - r.startMs) / 1000)
    if (loc) scheduleSounds(loc.index, loc.remaining)
  }, [locate, scheduleSounds])

  const tick = useCallback(() => {
    const r = ref.current
    if (r.status !== 'running') return
    const elapsed = (Date.now() - r.startMs) / 1000
    const loc = locate(elapsed)

    if (!loc) {
      r.status = 'done'
      persistRef.current?.(null)
      setSnap({
        status: 'done',
        index: Math.max(0, segments.length - 1),
        remaining: 0,
        progress: 1,
        elapsedTotal: totals.total,
        countdownActive: false,
      })
      return
    }

    const seg = segments[loc.index]
    const workIsNext = segments[loc.index + 1]?.type === 'work'

    // Announcements are pre-scheduled, not fired from here; the tick only
    // records that this segment's moment has passed, so a re-anchor lands
    // mid-segment without repeating what was already said.
    spokenRef.current = loc.index

    setSnap({
      status: 'running',
      index: loc.index,
      remaining: loc.remaining,
      progress: 1 - loc.remaining / seg.duration,
      elapsedTotal: elapsed,
      countdownActive: workIsNext && loc.remaining <= COUNTDOWN_SECONDS,
    })
    r.raf = requestAnimationFrame(tick)
  }, [segments, totals, locate])

  useEffect(() => {
    const r = ref.current
    if (segments.length === 0) return
    r.startMs = restore?.startedAt ?? Date.now()
    r.pausedAtMs = restore?.pausedAt ?? 0
    const startPaused = restore?.pausedAt != null
    r.status = startPaused ? 'paused' : 'running'
    // A restore lands mid-segment; announcing it belatedly would be noise. A
    // fresh start is at the top of segment 0 and should announce it.
    const loc0 = locate(((startPaused ? r.pausedAtMs : Date.now()) - r.startMs) / 1000)
    spokenRef.current = restore ? (loc0?.index ?? -1) : -1
    persistRef.current?.({ startedAt: r.startMs, pausedAt: startPaused ? r.pausedAtMs : null })
    if (!startPaused) {
      rescheduleSounds()
      r.raf = requestAnimationFrame(tick)
    }
    // On a fresh start the Start tap already unlocked audio and initAudio is a
    // no-op; after a reload-restore it surfaces the blocked state right away.
    // Clips can only be decoded once there is a context, so the announcements
    // join the schedule on the second pass, a moment after the beeps.
    void initAudio()
      // prepareAnnouncements drops whatever is switched off, so both lists go.
      .then(() => prepareAnnouncements([...announcementsIn(segments), ...callVocabularyIn(segments)]))
      .then(() => {
        clipsReadyRef.current = true
        rescheduleSounds()
        setAudioBlocked(!audioRunning())
      })

    // The audio clock stalls while the OS suspends it (screen lock, deep
    // background, another app grabbing the audio session) even though
    // wall-clock time keeps passing, so every scheduled beep would land
    // late. When the tab returns, try to resume the context (iOS leaves it
    // 'interrupted' after e.g. starting music) and re-anchor the beeps.
    const onVisibility = () => {
      if (document.visibilityState === 'visible')
        void initAudio().then(() => {
          rescheduleSounds()
          setAudioBlocked(!audioRunning())
        })
    }
    // After a reload there has been no user gesture yet, so the AudioContext
    // can't start. Unlock it on the first tap and schedule the beeps then.
    const unlock = () => {
      primeSpeech()
      if (audioRunning()) {
        setAudioBlocked(false)
        return
      }
      void initAudio().then(() => {
        rescheduleSounds()
        setAudioBlocked(!audioRunning())
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pointerdown', unlock)

    return () => {
      cancelAnimationFrame(r.raf)
      cancelScheduledSounds()
      cancelAnnouncements()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointerdown', unlock)
    }
  }, [segments, tick, rescheduleSounds, locate, restore])

  const controls = useMemo<SessionControls>(
    () => ({
      pause: () => {
        const r = ref.current
        if (r.status !== 'running') return
        r.status = 'paused'
        r.pausedAtMs = Date.now()
        cancelAnimationFrame(r.raf)
        cancelScheduledSounds()
        cancelAnnouncements()
        persistRef.current?.({ startedAt: r.startMs, pausedAt: r.pausedAtMs })
        setSnap((s) => ({ ...s, status: 'paused' }))
      },
      resume: () => {
        const r = ref.current
        if (r.status !== 'paused') return
        r.startMs += Date.now() - r.pausedAtMs
        r.status = 'running'
        persistRef.current?.({ startedAt: r.startMs, pausedAt: null })
        rescheduleSounds()
        r.raf = requestAnimationFrame(tick)
      },
      restart: () => {
        const r = ref.current
        cancelAnimationFrame(r.raf)
        cancelAnnouncements()
        spokenRef.current = -1
        r.status = 'running'
        r.startMs = Date.now()
        persistRef.current?.({ startedAt: r.startMs, pausedAt: null })
        rescheduleSounds()
        r.raf = requestAnimationFrame(tick)
      },
      skip: () => {
        const r = ref.current
        if (r.status !== 'running') return
        const loc = locate((Date.now() - r.startMs) / 1000)
        if (!loc) return
        // Shifting the anchor back by the remaining time lands elapsed exactly
        // on the next boundary; tick, persistence and restore all derive from
        // the anchor, so nothing else needs to move.
        r.startMs -= loc.remaining * 1000
        persistRef.current?.({ startedAt: r.startMs, pausedAt: null })
        const next = segments[loc.index + 1]
        if (next) {
          // scheduleSounds clears the old queue, so it must run before the
          // announcement beep or it would silence it too.
          scheduleSounds(loc.index + 1, next.duration)
          if (next.type === 'work') beepGo()
          else beepRest()
        } else {
          cancelScheduledSounds()
          cancelAnnouncements()
          beepFinish()
          announce(FINISH_ANNOUNCEMENT)
        }
        cancelAnimationFrame(r.raf)
        r.raf = requestAnimationFrame(tick)
      },
      devJump: () => {
        const r = ref.current
        if (r.status !== 'running') return
        const elapsed = (Date.now() - r.startMs) / 1000
        // Where to land for each sound the session still makes: a little ahead
        // of it, so the pre-scheduled audio plays out naturally instead of
        // being jumped over. A segment-end needs the whole lead-in (countdown
        // ticks, boundary beep, announcement); a time call is a single clip and
        // needs only a moment. Segments shorter than their lead are entered at
        // their start instead.
        const callsOn = timeCallsEnabled()
        const targets: number[] = []
        for (let i = 0; i < segments.length; i++) {
          const start = totals.starts[i]
          const land = (moment: number, lead: number) =>
            targets.push(Math.max(start, moment - lead))
          if (callsOn) for (const { at } of callsFor(segments[i])) land(start + at, 1)
          land(start + segments[i].duration, COUNTDOWN_SECONDS + 1)
        }
        const target = targets.sort((a, b) => a - b).find((t) => t > elapsed + 0.05)
        if (target === undefined) return
        r.startMs -= (target - elapsed) * 1000
        persistRef.current?.({ startedAt: r.startMs, pausedAt: null })
        rescheduleSounds()
        cancelAnimationFrame(r.raf)
        r.raf = requestAnimationFrame(tick)
      },
    }),
    [tick, rescheduleSounds, locate, segments, scheduleSounds, totals],
  )

  return [snap, controls, audioBlocked]
}
