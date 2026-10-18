import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { downloadUrl, type LessonCard, type Resource, type SectionQuizStatus } from '../api'
import { fileExt, fileMeta, previewKind, tileClass, updatedLabel } from '../lib/format'
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

/** A file's type in a small chip: PDF, DOCX… */
const chipText = (r: Resource) => fileExt(r).toUpperCase().slice(0, 4) || 'FILE'

/** Page 1 of the file (or a type illustration when there's no preview), with the type chip bottom-left. */
export function DocPreview({ resource }: { resource: Resource }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(resource.previewUrl) && !failed
  return (
    <span className={`doc-preview ${showImage ? '' : 'doc-preview--art'}`} aria-hidden="true">
      {showImage ? (
        <img src={resource.previewUrl ?? ''} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <DocArt kind={previewKind(resource)} />
      )}
      <span className={`type-chip ${tileClass(resource)}`}>{chipText(resource)}</span>
    </span>
  )
}

/** Type illustrations drawn on an 88 x 116 page: never a blank tile. */
function DocArt({ kind }: { kind: ReturnType<typeof previewKind> }) {
  const line = (y: number, w = 66, cls = 'art-line') => <rect key={`${cls}${y}`} className={cls} x="11" y={y} width={w} height="2" rx="1" />
  let body: ReactNode
  if (kind === 'form') {
    body = [
      <rect key="h" className="art-ink" x="11" y="11" width="44" height="4" rx="1" />,
      ...[23, 41, 59].flatMap((y) => [line(y, 26), <rect key={`f${y}`} className="art-field" x="11.5" y={y + 4.5} width="65" height="8" rx="1.3" />]),
    ]
  } else if (kind === 'sheet') {
    body = [
      <rect key="h" className="art-ink" x="11" y="11" width="46" height="4" rx="1" />,
      <rect key="hd" className="art-tint" x="11" y="23" width="66" height="8" />,
      <rect key="g" className="art-field" x="11.5" y="23.5" width="65" height="58" />,
      ...[35, 46, 58, 70].map((y) => <rect key={`r${y}`} className="art-rule" x="11" y={y} width="66" height="1" />),
      <rect key="c1" className="art-rule" x="33" y="23" width="1" height="59" />,
      <rect key="c2" className="art-rule" x="55" y="23" width="1" height="59" />,
    ]
  } else if (kind === 'slides') {
    body = [
      <rect key="s" className="art-field" x="9.5" y="30.5" width="69" height="40" rx="2" />,
      <rect key="t" className="art-ink" x="17" y="40" width="40" height="4" rx="1" />,
      <rect key="l1" className="art-line" x="17" y="50" width="54" height="2" rx="1" />,
      <rect key="l2" className="art-line" x="17" y="55" width="44" height="2" rx="1" />,
    ]
  } else if (kind === 'image') {
    body = [
      <circle key="sun" className="art-tint" cx="60" cy="34" r="8" />,
      <path key="m" className="art-accent" d="M11 80 L34 52 L50 70 L60 60 L77 80 Z" />,
    ]
  } else if (kind === 'video') {
    body = [<circle key="c" className="art-tint" cx="44" cy="50" r="18" />, <path key="p" className="art-accent" d="M39 41 L53 50 L39 59 Z" />]
  } else if (kind === 'archive') {
    body = [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} className={i % 2 ? 'art-line' : 'art-ink'} x={i % 2 ? 44 : 40} y={14 + i * 8} width="4" height="5" rx="1" />)
  } else {
    body = [
      <rect key="h" className="art-ink" x="11" y="12" width="53" height="5" rx="1" />,
      line(23), line(28), line(33),
      <rect key="a1" className="art-accent" x="11" y="42" width="35" height="4" rx="1" />,
      line(51), line(56), line(62), line(67, 44),
      <rect key="a2" className="art-accent" x="11" y="78" width="32" height="4" rx="1" />,
    ]
  }
  return (
    <svg className="doc-art" viewBox="0 0 88 116" preserveAspectRatio="xMidYMin meet" focusable="false">
      {body}
    </svg>
  )
}

/** Resource card: first-page preview, title + meta, round download button. The whole card is one link. */
export function ResourceCard({ resource, compact = false }: { resource: Resource; compact?: boolean }) {
  const meta = fileMeta(resource)
  const updated = updatedLabel(resource)
  if (compact) {
    return (
      <a className="res-row" href={downloadUrl(resource.id)} download aria-label={`Download ${resource.title} (${meta.replace(/ {2}·  /g, ', ')})`}>
        <FileTile resource={resource} small />
        <span className="file-card__text">
          <span className="row-title-sm">{resource.title}</span>
          <span className="body-xs">{meta}</span>
        </span>
        <span className="dl dl--sm" aria-hidden="true">
          <DownloadIcon size={15} />
        </span>
      </a>
    )
  }
  return (
    <a
      className="file-card"
      href={downloadUrl(resource.id)}
      download
      title={resource.title}
      aria-label={`Download ${resource.title} (${[meta.replace(/ {2}·  /g, ', '), updated].filter(Boolean).join(', ')})`}
    >
      <DocPreview resource={resource} />
      <span className="file-card__text">
        <span className="file-card__title">{resource.title}</span>
        <span className="body-xs">{meta}</span>
        {updated && <span className="body-xs">{updated}</span>}
      </span>
      <span className="dl dl--sm" aria-hidden="true">
        <DownloadIcon size={15} />
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
