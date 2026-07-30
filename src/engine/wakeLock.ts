import { useEffect } from 'react'

/**
 * Keeps the screen awake while a session runs. The lock is auto-released by
 * the browser when the tab hides, so we re-request it on return.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let lock: WakeLockSentinel | null = null
    let disposed = false

    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (e.g. low battery) — the timer still works, screen may sleep.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !disposed) void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
