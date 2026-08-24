/**
 * Links from the app to the help page. A plain tap opens the page in an
 * in-app overlay (HelpOverlay) instead of a new tab — on an installed iPhone
 * a new tab is Safari's sheet, whose cache is not the app's, so offline it
 * may not load, while the framed page is answered by the app's own service
 * worker. The <a> keeps its real href, so a modified click still opens the
 * full page in a tab on purpose.
 *
 * `HelpLink` is the "more in the help page" line that closes an in-app hint —
 * each hint keeps exactly one essential sentence above it. `HelpFooterLink`
 * is the quiet link at the bottom of a screen.
 */
import { useState, type ReactNode } from 'react'
import { HelpOverlay } from './HelpOverlay'

function HelpAnchor({
  section,
  className,
  children,
}: {
  section?: string
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <a
        href={section ? `/help/#${section}` : '/help/'}
        className={className}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </a>
      {open && <HelpOverlay section={section} onClose={() => setOpen(false)} />}
    </>
  )
}

export function HelpLink({ section, children }: { section: string; children: ReactNode }) {
  return (
    <p className="hint-more">
      <HelpAnchor section={section}>{children}</HelpAnchor>
    </p>
  )
}

export function HelpFooterLink({ section, children }: { section?: string; children: ReactNode }) {
  return (
    <HelpAnchor section={section} className="hint-link">
      {children}
    </HelpAnchor>
  )
}
