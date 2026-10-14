// Links to a section's or lesson's source material (e.g. the practice's Google Drive docs). Open in a new tab.
import { useId } from 'react'
import type { SourceLink } from '../api'
import { ArrowRightIcon, PlusIcon, TrashIcon } from './Icons'

export function SourceLinks({ links, className = '' }: { links?: SourceLink[]; className?: string }) {
  if (!links?.length) return null
  return (
    <ul className={`source-links ${className}`}>
      {links.map((l, i) => (
        <li key={`${l.url}-${i}`}>
          <a className="source-link" href={l.url} target="_blank" rel="noopener noreferrer">
            <span>{l.label}</span>
            <ArrowRightIcon />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Admin editor: rows of name + link. */
export function LinksEditor({ label, links, onChange }: { label: string; links: SourceLink[]; onChange: (l: SourceLink[]) => void }) {
  const id = useId()
  const set = (i: number, k: keyof SourceLink, v: string) => onChange(links.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  return (
    <fieldset className="links-editor">
      <legend className="link-slate">{label}</legend>
      {links.map((l, i) => (
        <div key={i} className="links-editor__row">
          <label className="sr-only" htmlFor={`${id}-n${i}`}>Name {i + 1}</label>
          <input id={`${id}-n${i}`} className="input" placeholder="Name (e.g. Welcome script)" value={l.label} maxLength={80} onChange={(e) => set(i, 'label', e.target.value)} />
          <label className="sr-only" htmlFor={`${id}-u${i}`}>Link {i + 1}</label>
          <input id={`${id}-u${i}`} className="input" type="url" placeholder="https://drive.google.com/…" value={l.url} onChange={(e) => set(i, 'url', e.target.value)} />
          <button type="button" className="round-btn round-btn--sm" aria-label={`Remove link ${i + 1}`} onClick={() => onChange(links.filter((_, j) => j !== i))}>
            <TrashIcon />
          </button>
        </div>
      ))}
      {links.length < 10 && (
        <button type="button" className="btn-ghost-text text-btn" onClick={() => onChange([...links, { label: '', url: '' }])}>
          <PlusIcon /> Add link
        </button>
      )}
    </fieldset>
  )
}

export const cleanLinks = (links: SourceLink[]) =>
  links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url)
