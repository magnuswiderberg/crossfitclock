import { useEffect, useState } from 'react'

/**
 * A QR code for a share link, drawn as one SVG path.
 *
 * The encoder is imported lazily: it is only ever wanted on the finish screen,
 * and nothing that runs during a workout should carry it. It's also generated
 * on the device rather than fetched — gym wifi fails exactly when this is
 * needed, and the chunk is precached by the service worker.
 *
 * The code it encodes is a `/c/<CODE>` page, which shows the code to be typed
 * and never imports anything: a scan opens the system browser, whose storage is
 * separate from the installed app's. The QR is a shortcut to the code, not a
 * second way in.
 */
export function ShareQr({ url, size = 96 }: { url: string; size?: number }) {
  const [qr, setQr] = useState<{ d: string; count: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('qrcode-generator')
      .then(({ default: qrcode }) => {
        const code = qrcode(0, 'M') // auto-size, medium correction — a short URL fits either way
        code.addData(url)
        code.make()
        const count = code.getModuleCount()
        // One path of 1×1 squares beats a few hundred <rect> elements, and
        // keeps the whole thing to a single fill.
        let d = ''
        for (let row = 0; row < count; row++) {
          for (let col = 0; col < count; col++) {
            if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
          }
        }
        if (!cancelled) setQr({ d, count })
      })
      .catch(() => {
        // First run while offline, before the chunk was cached. The printed
        // code is the thing that matters; the QR is a convenience.
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!qr) return null

  const svg = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${qr.count} ${qr.count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code linking to ${url}`}
    >
      <path d={qr.d} fill="#000" />
    </svg>
  )

  // The white plate is not decoration: scanners need the contrast, and its
  // padding is the quiet zone the spec asks for around the modules.
  return (
    <span className="share-qr">
      {import.meta.env.DEV ? (
        // Dev only, and styled to look like nothing: following your own QR is
        // how you check where it points without a second device. On a phone
        // tapping it makes no sense — the whole point is that someone *else*
        // scans it — so it never ships.
        <a href={url} target="_blank" rel="noreferrer">
          {svg}
        </a>
      ) : (
        svg
      )}
    </span>
  )
}
