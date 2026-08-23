/**
 * "More in the help page" line that closes an in-app hint, pointing at one
 * section of /help. It opens in a new tab — on an installed iPhone app that is
 * Safari's sheet, whose cache is not the app's — so offline it may not load.
 * Whatever the hint says above this line therefore has to stand on its own,
 * which is why each hint keeps exactly one essential sentence.
 */
import type { ReactNode } from 'react'

export function HelpLink({ section, children }: { section: string; children: ReactNode }) {
  return (
    <p className="hint-more">
      <a href={`/help/#${section}`} target="_blank" rel="noreferrer">
        {children}
      </a>
    </p>
  )
}
