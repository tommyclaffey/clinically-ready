// Videos: the recording plan. Every lesson is built around a video; this page shows which ones still need
// recording, gives the talking points to record from (pulled from the lesson's own overview, sections,
// takeaways and quick check), and takes the link once it's uploaded.
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type AdminLesson, type AdminWeek } from '../../api'
import { TopBar } from '../../components/Shell'
import { Disclosure, ErrorState, PageHead, ProgressBar, Spinner } from '../../components/ui'
import { plural, weekLabel } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useTerms } from '../../lib/terms'
import { VideoField } from '../../components/VideoField'

type Filter = 'todo' | 'done' | 'all'

/** What to say on camera, in the order the lesson presents it. */
export function talkingPoints(l: AdminLesson) {
  const blocks = l.blocks ?? []
  const firstText = blocks.find((b) => b.type === 'p')
  return {
    open: l.overview?.trim() || (firstText && 'text' in firstText ? firstText.text : ''),
    cover: blocks.flatMap((b) => (b.type === 'h' ? [b.text] : [])),
    land: blocks.flatMap((b) => (b.type === 'takeaways' ? b.items : [])),
    asked: (l.quiz ?? []).map((q) => q.prompt).filter(Boolean),
  }
}

export function AdminVideosPage() {
  const terms = useTerms()
  const content = useApi(() => api.adminContent())
  const [filter, setFilter] = useState<Filter>('todo')

  if (content.loading && !content.data) return <><TopBar /><Spinner label="Loading videos" /></>
  if (content.error || !content.data) return <><TopBar /><ErrorState message={content.error ?? 'No data.'} onRetry={content.reload} /></>

  const weeks = content.data.weeks
  const all = weeks.flatMap((w) => w.lessons)
  const recorded = all.filter((l) => l.videoUrl).length
  const counts: Record<Filter, number> = { todo: all.length - recorded, done: recorded, all: all.length }
  const show = (l: AdminLesson) => filter === 'all' || (filter === 'done') === Boolean(l.videoUrl)
  const visible = weeks.filter((w) => w.lessons.some(show))
  let n = 0
  const numbers = new Map(all.map((l) => [l.id, ++n]))

  return (
    <>
      <TopBar />
      <PageHead label="ADMIN" title="Videos">
        Every lesson is built around a video. Record each one from its talking points, then paste a YouTube, Vimeo or Loom link, or upload the file. {terms.members[0]!.toUpperCase() + terms.members.slice(1)} see it straight away.
      </PageHead>

      <section className="card videos-summary" aria-labelledby="vs-title">
        <div className="videos-summary__head">
          <h2 id="vs-title" className="display-sm">{recorded} of {plural(all.length, 'video')} recorded</h2>
          <p className="meta">{counts.todo ? `${plural(counts.todo, 'lesson')} still showing “Video coming soon”` : 'Every lesson has its video.'}</p>
        </div>
        <ProgressBar percent={all.length ? (recorded / all.length) * 100 : 0} label="Videos recorded" />
        <div className="pills" role="group" aria-label="Show">
          {([['todo', 'Still to record'], ['done', 'Recorded'], ['all', 'All']] as const).map(([k, label]) => (
            <button key={k} type="button" className={`pill ${filter === k ? 'is-active' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label} <span className="pill__n">{counts[k]}</span>
            </button>
          ))}
        </div>
      </section>

      {visible.length === 0 ? (
        <p className="body-md videos-empty">{filter === 'todo' ? 'Nothing left to record.' : 'No videos yet.'}</p>
      ) : (
        visible.map((w) => <SectionCard key={w.id} week={w} show={show} numbers={numbers} onSaved={content.reload} />)
      )}
    </>
  )
}

function SectionCard({ week, show, numbers, onSaved }: { week: AdminWeek; show: (l: AdminLesson) => boolean; numbers: Map<number, number>; onSaved: () => void }) {
  const done = week.lessons.filter((l) => l.videoUrl).length
  const titleId = useId()
  return (
    <section className="card videos-week" aria-labelledby={titleId}>
      <div className="videos-week__head">
        <h2 id={titleId} className="card-serif">{weekLabel(week)}</h2>
        <p className="meta">{done} of {week.lessons.length} recorded</p>
      </div>
      <ul className="video-rows">
        {week.lessons.filter(show).map((l) => (
          <VideoRow key={l.id} lesson={l} n={numbers.get(l.id) ?? 0} onSaved={onSaved} />
        ))}
      </ul>
    </section>
  )
}

function VideoRow({ lesson, n, onSaved }: { lesson: AdminLesson; n: number; onSaved: () => void }) {
  const [url, setUrl] = useState(lesson.videoUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState(false)
  const tp = talkingPoints(lesson)
  const has = Boolean(lesson.videoUrl)

  const save = async (e: FormEvent, value = url.trim()) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.setLessonVideo(lesson.id, { videoUrl: value })
      setMsg({ ok: true, text: value ? 'Saved. It’s live on the lesson.' : 'Removed.' })
      onSaved()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="video-row">
      <div className="video-row__head">
        <span className={`rec-status ${has ? 'is-done' : ''}`}>{has ? 'Recorded' : 'To record'}</span>
        <div className="video-row__text">
          <Link className="row-title lesson-row__link" to={`/lesson/${lesson.id}`}>{lesson.title}</Link>
          <span className="body-xs">Lesson {n}{lesson.durationMin ? `  ·  aim for about ${lesson.durationMin} min` : ''}</span>
        </div>
      </div>

      <Disclosure className="video-row__tp" title="Talking points" meta={open ? '' : `${tp.cover.length + tp.land.length} points`} open={open} onToggle={setOpen} headingLevel={3}>
        <div className="tp">
          {tp.open && (
            <div className="tp__block">
              <p className="label-muted">OPEN WITH</p>
              <p className="body-sm-dark">{tp.open}</p>
            </div>
          )}
          {tp.cover.length > 0 && (
            <div className="tp__block">
              <p className="label-muted">COVER, IN THIS ORDER</p>
              <ol className="tp__list body-sm-dark">{tp.cover.map((c, i) => <li key={i}>{c}</li>)}</ol>
            </div>
          )}
          {tp.land.length > 0 && (
            <div className="tp__block">
              <p className="label-muted">MAKE SURE THEY REMEMBER</p>
              <ul className="tp__list body-sm-dark">{tp.land.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {tp.asked.length > 0 && (
            <div className="tp__block">
              <p className="label-muted">THE QUICK CHECK ASKS</p>
              <ul className="tp__list body-sm-dark">{tp.asked.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      </Disclosure>

      <form className="video-row__form" onSubmit={save}>
        <VideoField value={url} onChange={setUrl} compact />
        <button type="submit" className="btn btn--dark btn--small" disabled={busy || url.trim() === (lesson.videoUrl ?? '')}>
          {busy ? 'Saving…' : has ? 'Update' : 'Add video'}
        </button>
        {has && (
          <button type="button" className="btn-ghost-text text-btn" disabled={busy} onClick={(e) => { setUrl(''); void save(e as unknown as FormEvent, '') }}>
            Remove
          </button>
        )}
      </form>
      {msg && <p className={msg.ok ? 'meta' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </li>
  )
}
