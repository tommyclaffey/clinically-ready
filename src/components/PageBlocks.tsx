// A step's page, rendered block by block in the order the admin built it (like a Notion page).
// Runs of text blocks share one reading card; everything else is its own card.
import { useId, useState } from 'react'
import { downloadUrl, type ContentBlock, type LessonDetail, type PageBlock, type Resource } from '../api'
import { FormCard } from '../pages/Paperwork'
import { AppCard } from './AppCard'
import { CheckIcon, ChevronDownIcon, DownloadIcon } from './Icons'
import { LessonContent } from './LessonContent'
import { Player } from './Player'
import { QuickCheck } from './QuickCheck'
import { SourceLinks } from './SourceLinks'
import { ResourceCard } from './ui'
import { plural } from '../lib/format'

const TEXTY = new Set(['h', 'p', 'quote', 'callout', 'list', 'checklist', 'steps', 'dodont'])
const isText = (b: PageBlock): b is ContentBlock => TEXTY.has(b.type)

type Group = { kind: 'text'; blocks: ContentBlock[] } | { kind: 'block'; block: PageBlock }

function groupsOf(blocks: PageBlock[]): Group[] {
  const out: Group[] = []
  for (const b of blocks) {
    const last = out[out.length - 1]
    if (isText(b)) {
      if (last?.kind === 'text') last.blocks.push(b)
      else out.push({ kind: 'text', blocks: [b] })
    } else out.push({ kind: 'block', block: b })
  }
  return out
}

/** mainVideoIndex: the index (in `blocks`) of the video that saves the resume position, or -1. */
export function PageBlocks({ blocks, d, onChanged, mainVideoIndex = -1 }: { blocks: PageBlock[]; d: LessonDetail; onChanged: () => void; mainVideoIndex?: number }) {
  const main = mainVideoIndex >= 0 ? blocks[mainVideoIndex] : undefined
  return (
    <div className="page-blocks">
      {groupsOf(blocks).map((g, i) =>
        g.kind === 'text' ? (
          <section key={i} className="card reading-card"><LessonContent blocks={g.blocks} /></section>
        ) : (
          <Block key={i} b={g.block} d={d} onChanged={onChanged} main={g.block === main} />
        ),
      )}
    </div>
  )
}

function Block({ b, d, onChanged, main }: { b: PageBlock; d: LessonDetail; onChanged: () => void; main: boolean }) {
  switch (b.type) {
    case 'video':
      return <VideoBlock lessonId={d.lesson.id} title={d.lesson.title} url={b.url} transcript={b.transcript} posterUrl={d.lesson.posterUrl} main={main} startAt={main ? d.progress?.positionSec ?? 0 : 0} />
    case 'takeaways':
      return b.items.length ? <Takeaways items={b.items} /> : null
    case 'links':
      return b.items.length ? (
        <section className="card side-card links-card" aria-label="Links and sources">
          <h2 className="card-serif">Links and sources</h2>
          <SourceLinks links={b.items} />
        </section>
      ) : null
    case 'files':
      return d.resources.length ? <LessonResources resources={d.resources} /> : null
    case 'quiz':
      return <QuickCheck quiz={d.quiz} />
    case 'form': {
      const form = d.forms.find((f) => f.id === b.formId)
      return form ? <FormCard form={form} onDone={onChanged} startOpen={form.status !== 'done'} /> : null
    }
    case 'app': {
      const app = d.apps.find((a) => a.id === b.appId)
      return app ? <AppCard app={app} compact /> : null
    }
    case 'divider':
      return <hr className="page-divider" />
    default:
      return null
  }
}

/** A video block. The first one on the page is the step's main video and keeps the resume position. */
export function VideoBlock({ lessonId, title, url, transcript, posterUrl, startAt = 0, main = false }: {
  lessonId: number; title: string; url: string; transcript: string; posterUrl: string; startAt?: number; main?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="video-block">
      <Player lessonId={lessonId} title={title} videoUrl={url} posterUrl={posterUrl} startAt={startAt} trackProgress={main} />
      {transcript.trim() && (
        <details className="disc transcript-disc" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="disc__sum"><span className="disc__title">Transcript</span><ChevronDownIcon className="disc__chev" size={16} /></summary>
          <div className="disc__body"><p className="body-md prewrap">{transcript}</p></div>
        </details>
      )}
    </div>
  )
}

function Takeaways({ items }: { items: string[] }) {
  const id = useId()
  return (
    <section className="card takeaways" aria-labelledby={id}>
      <h2 id={id} className="card-serif">Key takeaways</h2>
      <ul className="kt-list">
        {items.map((k, i) => (
          <li key={i} className="kt">
            <span className="kt__dot" aria-hidden="true"><CheckIcon size={12} /></span>
            <span className="body-sm-dark">{k}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LessonResources({ resources }: { resources: Resource[] }) {
  const [status, setStatus] = useState('')
  const downloadAll = async () => {
    setStatus(`Downloading ${plural(resources.length, 'file')}…`)
    for (const r of resources) {
      const a = document.createElement('a')
      a.href = downloadUrl(r.id)
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
      await new Promise((res) => setTimeout(res, 400))
    }
    setStatus(`Started ${plural(resources.length, 'download')}.`)
  }
  return (
    <section className="card res-card" id="resources" aria-labelledby="lr-title" tabIndex={-1}>
      <h2 id="lr-title" className="card-serif">Downloads</h2>
      <ul className="res-list">
        {resources.map((r) => <li key={r.id}><ResourceCard resource={r} compact /></li>)}
      </ul>
      {resources.length > 1 && (
        <div className="res-card__all">
          <button type="button" className="btn btn--ghost" onClick={downloadAll}>
            <DownloadIcon /> Download all ({resources.length})
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{status}</p>
    </section>
  )
}
