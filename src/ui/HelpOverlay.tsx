/**
 * The help page (/help) framed inside the app, so "how does X work" never
 * leaves the clock. The page is precached by the service worker under its own
 * URL, so unlike a target="_blank" link — which on an installed iPhone opens
 * Safari's sheet, whose cache is not the app's — the overlay works offline.
 * The framed page hides its own site chrome (html.embedded, see the inline
 * script in help/index.html and the .embedded rules in site.css).
 *
 * Rendered through a portal: help links live inside hint modals, and a
 * position: fixed overlay must not depend on what its ancestors do.
 */
import { createPortal } from 'react-dom'

export function HelpOverlay({ section, onClose }: { section?: string; onClose: () => void }) {
  return createPortal(
    <div className="hint-overlay help-overlay" role="dialog" aria-modal="true" aria-label="Help and tips">
      <div className="help-card">
        <div className="help-card-head">
          <h2>Help &amp; tips</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="help-card-body">
          <iframe src={section ? `/help/#${section}` : '/help/'} title="Help and tips" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
