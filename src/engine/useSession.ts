import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Segment } from '../model/compile'
import { COUNTDOWN_SECONDS } from '../model/types'
import { beepCountdown, beepFinish, beepGo, beepRest } from './audio'

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
}

/**
 * Walks the compiled timeline. Time is measured against performance.now()
 * from the segment's absolute start, so display and beeps never drift the
 * way accumulated setInterval ticks do.
 */
export function useSession(segments: Segment[]): [SessionSnapshot, SessionControls] {
  const totals = useMemo(() => {
    let acc = 0
    const starts = segments.map((s) => {
      const v = acc
      acc += s.duration
      return v
    })
    return { starts, total: acc }
  }, [segments])

  const [snap, setSnap] = useState<SessionSnapshot>(() => ({
    status: segments.length > 0 ? 'running' : 'done',
    index: 0,
    remaining: segments[0]?.duration ?? 0,
    progress: 0,
    elapsedTotal: 0,
    countdownActive: false,
  }))

  const ref = useRef({
    status: 'running' as SessionStatus,
    index: 0,
    segStartMs: 0,
    pausedAtMs: 0,
    firedAt2: false,
    firedAt1: false,
    raf: 0,
  })

  const tick = useCallback(() => {
    const r = ref.current
    if (r.status !== 'running') return
    let seg = segments[r.index]
    let remaining = seg.duration - (performance.now() - r.segStartMs) / 1000

    while (remaining <= 0) {
      const nextIndex = r.index + 1
      if (nextIndex >= segments.length) {
        r.status = 'done'
        beepFinish()
        setSnap({
          status: 'done',
          index: r.index,
          remaining: 0,
          progress: 1,
          elapsedTotal: totals.total,
          countdownActive: false,
        })
        return
      }
      const next = segments[nextIndex]
      if (next.type === 'work') beepGo()
      else beepRest()
      r.segStartMs += seg.duration * 1000
      r.index = nextIndex
      r.firedAt2 = false
      r.firedAt1 = false
      seg = next
      remaining = seg.duration - (performance.now() - r.segStartMs) / 1000
    }

    const workIsNext = segments[r.index + 1]?.type === 'work'
    if (workIsNext) {
      if (remaining <= COUNTDOWN_SECONDS && !r.firedAt2) {
        r.firedAt2 = true
        beepCountdown()
      }
      if (remaining <= 1 && !r.firedAt1) {
        r.firedAt1 = true
        beepCountdown()
      }
    }

    setSnap({
      status: 'running',
      index: r.index,
      remaining,
      progress: 1 - remaining / seg.duration,
      elapsedTotal: totals.starts[r.index] + (seg.duration - remaining),
      countdownActive: workIsNext && remaining <= COUNTDOWN_SECONDS,
    })
    r.raf = requestAnimationFrame(tick)
  }, [segments, totals])

  useEffect(() => {
    const r = ref.current
    if (segments.length === 0) return
    r.status = 'running'
    r.index = 0
    r.segStartMs = performance.now()
    r.firedAt2 = false
    r.firedAt1 = false
    r.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(r.raf)
  }, [segments, tick])

  const controls = useMemo<SessionControls>(
    () => ({
      pause: () => {
        const r = ref.current
        if (r.status !== 'running') return
        r.status = 'paused'
        r.pausedAtMs = performance.now()
        cancelAnimationFrame(r.raf)
        setSnap((s) => ({ ...s, status: 'paused' }))
      },
      resume: () => {
        const r = ref.current
        if (r.status !== 'paused') return
        r.segStartMs += performance.now() - r.pausedAtMs
        r.status = 'running'
        r.raf = requestAnimationFrame(tick)
      },
      restart: () => {
        const r = ref.current
        cancelAnimationFrame(r.raf)
        r.status = 'running'
        r.index = 0
        r.segStartMs = performance.now()
        r.firedAt2 = false
        r.firedAt1 = false
        r.raf = requestAnimationFrame(tick)
      },
    }),
    [tick],
  )

  return [snap, controls]
}
