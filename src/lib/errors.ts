// Browser errors go to the server's error log (server/routes/ops.mjs), so the nightly alert hears about a page that
// breaks in someone's browser, not just on the server (Nov 19, launch Gate A). At most 5 reports per page load.
let sent = 0
const seen = new Set<string>()

function report(message: string, stack?: string) {
  const key = message.slice(0, 200)
  if (sent >= 5 || seen.has(key)) return
  seen.add(key)
  sent += 1
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-COA': '1' },
    body: JSON.stringify({ message: key, stack: (stack || '').slice(0, 2000), path: location.pathname }),
    keepalive: true,
  }).catch(() => {})
}

export function watchErrors() {
  window.addEventListener('error', (e) => {
    // A failed image or script load has no message; those aren't app errors
    if (!e.message) return
    report(e.message, e.error instanceof Error ? e.error.stack : undefined)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    // A signed-out request or a refused form isn't a bug (ApiError); only real crashes count
    if (r && typeof r === 'object' && 'status' in r) return
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined)
  })
}
