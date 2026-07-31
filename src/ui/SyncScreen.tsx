import { useState } from 'react'
import type { Workout } from '../model/types'
import {
  claimHandle,
  connect,
  disconnect,
  loadSyncState,
  syncNow,
} from '../model/sync'

interface Props {
  workouts: Workout[]
  onWorkoutsChange: (w: Workout[]) => void
  onBack: () => void
}

export function SyncScreen({ workouts, onWorkoutsChange, onBack }: Props) {
  const [state, setState] = useState(loadSyncState)
  const [newHandle, setNewHandle] = useState('')
  const [handle, setHandle] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /** Run an action, surface its error, and refresh local sync state after. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setState(loadSyncState())
      setBusy(false)
    }
  }

  const pullMerged = async () => {
    const merged = await syncNow(workouts)
    if (merged) onWorkoutsChange(merged)
  }

  if (state) {
    return (
      <div className="screen">
        <div className="screen-head">
          <button className="btn btn-ghost" onClick={onBack}>
            ‹ Back
          </button>
          <h1 className="app-title">Sync</h1>
          <span />
        </div>

        <p className="sync-note">
          Workouts sync to the handle below. To add another device, open Sync there and connect
          with this handle and sync code.
        </p>

        <div className="sync-account">
          <div className="sync-row">
            <span className="sync-label">Handle</span>
            <span className="sync-value">{state.handle}</span>
          </div>
          <div className="sync-row">
            <span className="sync-label">Sync code</span>
            <span className="sync-value sync-code">{state.secret}</span>
          </div>
          <div className="sync-row">
            <span className="sync-label">Last sync</span>
            <span className="sync-value">
              {state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : 'never'}
            </span>
          </div>
        </div>

        {error && <p className="sync-error">{error}</p>}
        {notice && <p className="sync-note">{notice}</p>}

        <button
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await pullMerged()
              setNotice('Synced.')
            })
          }
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          className="btn btn-danger btn-block"
          disabled={busy}
          onClick={() => {
            const warning =
              `Disconnect from "${state.handle}" on this device?\n\n` +
              `Your workouts stay on this device, but you'll need the sync code ` +
              `(${state.secret}) to reconnect. Save it somewhere if no other device is connected.`
            if (!window.confirm(warning)) return
            disconnect()
            setState(null)
          }}
        >
          Disconnect this device
        </button>
        <p className="sync-note">
          Disconnecting only forgets the handle on this device — nothing is deleted.
        </p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Back
        </button>
        <h1 className="app-title">Sync</h1>
        <span />
      </div>

      <p className="sync-note">
        Sync keeps your workouts the same on every device — for example, edit on the desktop, run
        on your phone. No email needed: pick a handle, get a sync code, enter both on your other
        devices. Presets always stay local.
      </p>

      {error && <p className="sync-error">{error}</p>}

      <h2 className="section-title">New handle</h2>
      <div className="edit-field">
        <label>Handle (3–20 characters: letters, digits, dashes)</label>
        <input
          type="text"
          value={newHandle}
          autoCapitalize="none"
          placeholder="e.g. magnus"
          onChange={(e) => setNewHandle(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !newHandle.trim()}
        onClick={() =>
          run(async () => {
            await claimHandle(newHandle)
            await pullMerged()
          })
        }
      >
        {busy ? 'Working…' : 'Create and sync'}
      </button>

      <h2 className="section-title">Or connect to an existing handle</h2>
      <div className="edit-field">
        <label>Handle</label>
        <input
          type="text"
          value={handle}
          autoCapitalize="none"
          onChange={(e) => setHandle(e.target.value)}
        />
      </div>
      <div className="edit-field">
        <label>Sync code (shown on your other device’s Sync screen)</label>
        <input
          type="text"
          value={code}
          autoCapitalize="characters"
          className="sync-code-input"
          placeholder="XXXXXX"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !handle.trim() || !code.trim()}
        onClick={() =>
          run(async () => {
            await connect(handle, code)
            await pullMerged()
          })
        }
      >
        {busy ? 'Working…' : 'Connect and sync'}
      </button>
    </div>
  )
}
