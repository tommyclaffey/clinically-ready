import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { downloadUrl, type LessonCard, type Resource, type SectionQuizStatus } from '../api'
import { fileExt, fileMeta, tileClass } from '../lib/format'
import { CheckIcon, ChevronDownIcon, DownloadIcon, LockIcon, PlayDisc, QuizIcon, VideoIcon } from './Icons'

/** 3px Blue Deep dot + uppercase label. */
export function Label({ children, as: Tag = 'p', className = '' }: { children: ReactNode; as?: 'p' | 'span' | 'h2'; className?: string }) {
  return (
    <Tag className={`label ${className}`}>
      <span className="label__dot" aria-hidden="true" />
      <span>{children}</span>
    </Tag>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="body-sm">{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error card" role="alert">
      <p className="card-serif">Something went wrong</p>
      <p className="body-sm">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="card-serif">{title}</p>
      {children && <p className="body-sm">{children}</p>}
    </div>
  )
}

export function FullPageLoading() {
  return (
    <main className="fullpage">
      <Spinner />
    </main>
  )
}

export function FullPageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main className="fullpage">
      <ErrorState message={message} onRetry={onRetry} />
    </main>
  )
}

export function Avatar({ initials, size = 40, tone = 'blue' }: { initials: string; size?: number; tone?: 'blue' | 'media' }) {
  return (
    <span className={`avatar avatar--${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  )
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label}>
      <span className="bar__fill" style={{ width: `${p}%` }} />
    </div>
  )
}

export function FileTile({ resource, small = false }: { resource: Resource; small?: boolean }) {
  const ext = fileExt(resource).toUpperCase().slice(0, 4) || 'FILE'
  return (
    <span className={`tile ${tileClass(resource)} ${small ? 'tile--sm' : ''}`} aria-hidden="true">
      {ext}
    </span>
  )
}

/** Resource card: tile, title + meta, round download button. The whole card is one link. */
export function ResourceCard({ resource, compact = false }: { resource: Resource; compact?: boolean }) {
  return (
    <a
      className={compact ? 'res-row' : 'file-card'}
      href={downloadUrl(resource.id)}
      download
      aria-label={`Download ${resource.title} (${fileMeta(resource).replace(/ {2}·  /g, ', ')})`}
    >
      <FileTile resource={resource} small={compact} />
      <span className="file-card__text">
        <span className={compact ? 'row-title-sm' : 'row-title'}>{resource.title}</span>
        <span className="body-xs">{fileMeta(resource)}</span>
      </span>
      <span className={`dl ${compact ? 'dl--sm' : ''}`} aria-hidden="true">
        <DownloadIcon size={compact ? 15 : 16} />
      </span>
    </a>
  )
}

export function StatusMark({ status, n, size = 28 }: { status: LessonCard['status']; n: number; size?: number }) {
  if (status === 'complete') {
    return (
      <span className="status status--done" style={{ width: size, height: size }}>
        <CheckIcon size={size > 24 ? 14 : 12} />
        <span className="sr-only">Completed</span>
      </span>
    )
  }
  if (status === 'started') {
    return (
      <span className="status status--started" style={{ width: size, height: size }}>
        <span className="status__dot" style={{ width: size > 24 ? 10 : 8, height: size > 24 ? 10 : 8 }} />
        <span className="sr-only">In progress</span>
      </span>
    )
  }
  return (
    <span className="status status--todo" style={{ width: size, height: size }}>
      <span className="meta">{n}</span>
    </span>
  )
}

/** Video · Video coming soon · Reading and tasks (a step built with no video). */
export const stepKind = (l: LessonCard) => (l.hasVideo ? 'Video' : l.videoPlanned === false ? 'Reading and tasks' : 'Video coming soon')

/** "Video  ·  18 min  ·  3 downloads  ·  Quiz" (or "Reading" when there's no video) */
export function lessonMeta(l: LessonCard): string {
  const n = l.resourceCount ?? 0
  return [
    stepKind(l),
    l.durationMin ? `${l.durationMin} min` : '',
    n ? `${n} ${n === 1 ? 'download' : 'downloads'}` : '',
    l.hasQuiz ? 'Quiz' : '',
  ]
    .filter(Boolean)
    .join('  ·  ')
}

/** Small 16:9 video tile on a lesson row: the poster with a play button, or a quiet "coming soon" tile. */
export function LessonThumb({ lesson }: { lesson: LessonCard }) {
  if (lesson.hasVideo) {
    return (
      <span className="lesson-thumb" aria-hidden="true">
        {lesson.posterUrl ? <img src={lesson.posterUrl} alt="" /> : null}
        <span className="lesson-thumb__play"><PlayDisc size={22} /></span>
      </span>
    )
  }
  return (
    <span className="lesson-thumb lesson-thumb--soon" aria-hidden="true">
      <VideoIcon size={16} />
    </span>
  )
}

/** One row in the onboarding path (dashboard + /onboarding). */
export function LessonRow({ lesson, n, current, locked = false }: { lesson: LessonCard; n: number; current: boolean; locked?: boolean }) {
  const meta = lessonMeta(lesson)
  if (locked) {
    return (
      <li className="lesson-row is-locked">
        <span className="status status--todo" style={{ width: 28, height: 28 }}><LockIcon size={13} /><span className="sr-only">Locked</span></span>
        <LessonThumb lesson={lesson} />
        <div className="lesson-row__text">
          <span className="row-title">{lesson.title}</span>
          <span className="body-xs">{meta}</span>
        </div>
      </li>
    )
  }
  return (
    <li className={`lesson-row ${current ? 'is-current' : ''}`}>
      <StatusMark status={lesson.status} n={n} />
      <LessonThumb lesson={lesson} />
      <div className="lesson-row__text">
        <Link className="row-title lesson-row__link" to={`/lesson/${lesson.id}`}>
          {lesson.title}
        </Link>
        <span className="body-xs">{meta}</span>
      </div>
      {lesson.status === 'complete' ? (
        <span className="btn-ghost-text">Completed</span>
      ) : lesson.status === 'started' ? (
        <Link className="btn btn--dark btn--small" to={`/lesson/${lesson.id}`} aria-label={`Resume ${lesson.title}`}>
          Resume
        </Link>
      ) : (
        <Link className="link-slate" to={`/lesson/${lesson.id}`} aria-label={`Start ${lesson.title}`}>
          Start&nbsp;&nbsp;→
        </Link>
      )}
    </li>
  )
}

/** The quiz at the end of a section: what it takes, and whether it's done, ready, or waiting on the steps. */
export function QuizRow({ weekId, quiz, locked }: { weekId: number; quiz: SectionQuizStatus; locked?: boolean }) {
  const meta = `${quiz.drawCount} ${quiz.drawCount === 1 ? 'question' : 'questions'}  ·  pass mark ${quiz.passPercent}%  ·  new questions each try`
  return (
    <li className={`lesson-row quiz-row ${quiz.passed ? 'is-passed' : quiz.ready && !locked ? 'is-ready' : ''}`}>
      <span className={`status ${quiz.passed ? 'status--done' : 'status--todo'}`} style={{ width: 28, height: 28 }}>
        {quiz.passed ? <CheckIcon size={14} /> : <QuizIcon size={14} />}
        <span className="sr-only">{quiz.passed ? 'Passed' : 'Not passed yet'}</span>
      </span>
      <span className="quiz-row__tile" aria-hidden="true"><QuizIcon size={18} /></span>
      <div className="lesson-row__text">
        {locked || (!quiz.ready && !quiz.passed) ? (
          <span className="row-title">Section quiz</span>
        ) : (
          <Link className="row-title lesson-row__link" to={`/quiz/${weekId}`}>Section quiz</Link>
        )}
        <span className="body-xs">
          {quiz.passed ? `Passed${quiz.bestPercent != null ? `  ·  best ${quiz.bestPercent}%` : ''}` : locked ? 'Locked' : quiz.ready ? meta : 'Opens when you finish the steps above'}
        </span>
      </div>
      {quiz.passed ? (
        <Link className="btn-ghost-text" to={`/quiz/${weekId}`}>Review</Link>
      ) : quiz.ready && !locked ? (
        <Link className="btn btn--dark btn--small" to={`/quiz/${weekId}`}>{quiz.attempts ? 'Try again' : 'Take quiz'}</Link>
      ) : (
        <LockIcon size={14} className="quiz-row__lock" />
      )}
    </li>
  )
}

export function PageHead({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <Label>{label}</Label>
      <h1 className="display-lg">{title}</h1>
      {children && <p className="body-md page-head__intro">{children}</p>}
    </header>
  )
}

/** The organisation's logo, or a lettered badge in its brand colour when it has none yet. */
export function BrandMark({ logoUrl, name, size = 44, className = '' }: { logoUrl?: string | null; name: string; size?: number; className?: string }) {
  if (logoUrl) return <img className={className} src={logoUrl} alt="" width={size} height={size} />
  const letter = (name.trim()[0] ?? '·').toUpperCase()
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.48 }}>
      {letter}
    </span>
  )
}

/** A collapsible section: native <details> so it works without JS and with the keyboard. */
export function Disclosure({ title, meta, open, onToggle, children, className = '', headingLevel = 3 }: {
  title: ReactNode; meta?: ReactNode; open: boolean; onToggle: (open: boolean) => void; children: ReactNode; className?: string; headingLevel?: 2 | 3
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <details className={`disc ${className}`} open={open} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="disc__sum">
        <H className="disc__title">{title}</H>
        {meta && <span className="meta disc__meta">{meta}</span>}
        <ChevronDownIcon className="disc__chev" size={16} />
      </summary>
      <div className="disc__body">{children}</div>
    </details>
  )
}
