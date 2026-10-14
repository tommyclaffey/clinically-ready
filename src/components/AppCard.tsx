// One tool the team uses (SimplePractice, Slack, Notion…): open it, download it, bookmark it.
// Used on the Tools page and as an "app" block inside a step.
import { useState } from 'react'
import type { ToolApp } from '../api'
import { BookmarkIcon, CopyIcon, DownloadIcon, ExternalIcon } from './Icons'

/** The site's main domain (secure.simplepractice.com -> simplepractice.com), where its icon lives. */
const hostOf = (url: string) => {
  try {
    const parts = new URL(url).hostname.split('.')
    const twoPart = parts.length > 2 && /^(co|com|org|net|gov|ac)$/.test(parts[parts.length - 2]!)
    return parts.slice(twoPart ? -3 : -2).join('.')
  } catch {
    return ''
  }
}

/** The tool's own icon: the one the admin set, else the site's favicon (scaled, never altered), else its initial. */
export function AppIcon({ app, size = 44 }: { app: Pick<ToolApp, 'name' | 'iconUrl' | 'webUrl' | 'macUrl' | 'windowsUrl'>; size?: number }) {
  const host = hostOf(app.webUrl || app.macUrl || app.windowsUrl)
  const src = app.iconUrl || (host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '')
  const [failed, setFailed] = useState(false)
  return (
    <span className="app-icon" style={{ width: size, height: size }} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" width={size * 0.6} height={size * 0.6} onError={() => setFailed(true)} /> : <span className="app-icon__letter">{app.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function AppCard({ app, compact = false }: { app: ToolApp; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [showBookmark, setShowBookmark] = useState(false)
  const downloads = [
    { url: app.macUrl, label: 'Mac' },
    { url: app.windowsUrl, label: 'Windows' },
    { url: app.iosUrl, label: 'iPhone and iPad' },
    { url: app.androidUrl, label: 'Android' },
  ].filter((d) => d.url)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(app.webUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setShowBookmark(true)
    }
  }
  const newTab = <span className="sr-only"> (opens in a new tab)</span>

  return (
    <section className={`card app-card ${compact ? 'app-card--compact' : ''}`} aria-label={app.name}>
      <div className="app-card__head">
        <AppIcon app={app} />
        <div className="app-card__titles">
          <h3 className="row-title">{app.name}</h3>
          {app.description && <p className="body-sm">{app.description}</p>}
        </div>
      </div>

      <div className="app-card__actions">
        {app.webUrl && (
          <a className="btn btn--dark" href={app.webUrl} target="_blank" rel="noopener noreferrer">
            Open {app.name} <ExternalIcon />{newTab}
          </a>
        )}
        {app.webUrl && (
          <button type="button" className="btn btn--ghost" aria-expanded={showBookmark} onClick={() => setShowBookmark((s) => !s)}>
            <BookmarkIcon /> Bookmark it
          </button>
        )}
      </div>

      {showBookmark && app.webUrl && (
        <div className="app-card__bookmark">
          <p className="body-sm-dark">
            Open {app.name}, then press <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd> + <kbd>D</kbd> to bookmark it. On a phone, use Share, then Add to Home Screen.
          </p>
          <div className="app-card__link">
            <code className="body-xs">{app.webUrl}</code>
            <button type="button" className="btn-ghost-text text-btn" onClick={copy}>
              <CopyIcon /> {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</p>
        </div>
      )}

      {downloads.length > 0 && (
        <div className="app-card__downloads">
          <p className="label-muted">DOWNLOAD THE APP</p>
          <ul>
            {downloads.map((d) => (
              <li key={d.label}>
                <a className="dl-chip" href={d.url} target="_blank" rel="noopener noreferrer">
                  <DownloadIcon /> {d.label}{newTab}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {app.signinNote && (
        <p className="app-card__note body-sm-dark"><strong>Signing in: </strong>{app.signinNote}</p>
      )}
    </section>
  )
}
