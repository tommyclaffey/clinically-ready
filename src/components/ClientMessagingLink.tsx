// "About a client? Message your supervisor in SimplePractice." Each organisation sets the app and link;
// client details belong in that (HIPAA-compliant) system, not in this onboarding app.
import { useAuth } from '../auth'
import { useTerms } from '../lib/terms'
import { ChatIcon } from './Icons'

export function ClientMessagingLink({ compact = false }: { compact?: boolean }) {
  const { practice } = useAuth()
  const terms = useTerms()
  const c = practice?.clientMessaging
  if (!c) return null
  const text = (
    <>
      <strong className="text-slate">About a client?</strong> Don’t post client details here. Message your {terms.lead} in{' '}
      <a className="inline-link" href={c.url} target="_blank" rel="noopener noreferrer">{c.label}<span className="sr-only"> (opens in a new tab)</span></a>.
    </>
  )
  if (compact) return <p className="body-xs client-note">{text}</p>
  return (
    <div className="client-link">
      <ChatIcon className="icon-deep" />
      <p className="body-sm-dark">{text}</p>
    </div>
  )
}
