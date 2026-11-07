// Nov 7, Tommy: "have all my demo restart after a refresh". Runs before the app draws: a refresh inside the demo gets a fresh copy of
// the sample practice and lands on the start page. Real accounts never make this call (the flag is only there during a demo).
import { api } from '../api'

const FLAG = 'cr-demo'
export function markDemo(on: boolean) {
  try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG) } catch { /* private mode */ }
}

export async function restartDemoIfRefreshed() {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  // Inside another page's frame a refresh of that page reports "navigate", so every load there counts.
  if ((nav?.type !== 'reload' && window.self === window.top) || location.pathname === '/demo') return
  try { if (!localStorage.getItem(FLAG)) return } catch { return }
  try {
    const s = await api.demoRestart()
    sessionStorage.clear()
    localStorage.removeItem('coa-outline-open')
    history.replaceState(null, '', s.me.role === 'owner' ? '/admin/content' : '/')
  } catch { /* keep the copy they have */ }
}
