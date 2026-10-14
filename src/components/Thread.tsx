// A question's thread: the replies under it and a small box to add one.
import { useId, useState, type FormEvent } from 'react'
import { api, type Reply } from '../api'
import { relativeDate } from '../lib/format'
import { Avatar } from './ui'

export function Replies({ replies }: { replies?: Reply[] }) {
  if (!replies?.length) return null
  return (
    <ol className="thread" aria-label="Replies">
      {replies.map((r) => (
        <li key={r.id} className={`thread__msg${r.fromAsker ? '' : ' thread__msg--staff'}`}>
          <Avatar initials={r.authorInitials} size={32} tone={r.fromAsker ? 'blue' : 'media'} />
          <div className="thread__body">
            <p className="meta">{r.mine ? 'You' : r.authorName}  ·  {relativeDate(r.createdAt)}</p>
            <p className="body-sm-dark prewrap">{r.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ReplyForm({ questionId, label = 'Reply', onSent }: { questionId: number; label?: string; onSent: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return setError('Write a reply first.')
    setBusy(true)
    setError(null)
    try {
      await api.reply(questionId, body.trim())
      setBody('')
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your reply.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="reply-form" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea id={id} className="input textarea" rows={2} placeholder={`${label}…`} value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div><button type="submit" className="btn btn--dark btn--small" disabled={busy}>{busy ? 'Sending…' : label}</button></div>
    </form>
  )
}
