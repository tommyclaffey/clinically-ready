import { useEffect, useId, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { DemoBar, DemoTour } from './DemoTour'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, type AppNotification } from '../api'
import { relativeDate } from '../lib/format'
import { isAdminRole, useAuth } from '../auth'
import { cap, useTerms } from '../lib/terms'
import {
  BellIcon, ChartIcon, ChatIcon, ChevronDownIcon, FlagIcon, FolderIcon, HomeIcon, LayersIcon, VideoIcon, PenIcon, LockIcon, GridIcon,
  SearchIcon, SettingsIcon, SignOutIcon, TeamIcon, UserPlusIcon,
} from './Icons'
import { Avatar, BrandMark } from './ui'

interface NavItem {
  to: string
  label: string
  Icon: ComponentType<{ size?: number }>
  end?: boolean
  count?: string | null
  /** Screen-reader text for the count pill. Defaults to "x of y lessons complete". */
  countLabel?: string
  forceActive?: boolean
}

function NavList({ items, label }: { items: NavItem[]; label?: string }) {
  return (
    <ul className="sb-nav" aria-label={label}>
      {items.map(({ to, label: text, Icon, end, count, countLabel, forceActive }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            className={({ isActive }) => `nav-item ${isActive || forceActive ? 'is-active' : ''}`}
            aria-current={forceActive ? 'page' : undefined}
          >
            <Icon />
            <span className="nav-item__text">{text}</span>
            {count && (
              <span className="nav-count" aria-label={countLabel ?? `${count.replace('/', ' of ')} lessons complete`}>
                {count}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/** Paperwork for the nav: null when there is none; otherwise how many still need doing. */
function usePaperwork(pathname: string): { total: number; open: number } | null {
  const [state, setState] = useState<{ total: number; open: number } | null>(null)
  useEffect(() => {
    let live = true
    api
      .myForms()
      .then((forms) => {
        if (live) setState(forms.length ? { total: forms.length, open: forms.filter((f) => f.required && f.status !== 'done').length } : null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pathname])
  return state
}

/** Whether the org has added any tools (the Tools nav item only shows when it has). */
function useHasTools(pathname: string): boolean {
  const [has, setHas] = useState(false)
  useEffect(() => {
    let live = true
    api.apps().then((a) => { if (live) setHas(a.length > 0) }).catch(() => {})
    return () => {
      live = false
    }
  }, [pathname])
  return has
}

/** Counts done/total lessons for the "My onboarding" pill. Refetches on navigation. */
function useLessonCount(pathname: string): string | null {
  const [count, setCount] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api
      .weeks()
      .then((weeks) => {
        if (!live) return
        const all = weeks.flatMap((w) => w.lessons)
        setCount(all.length ? `${all.filter((l) => l.status === 'complete').length}/${all.length}` : null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pathname])
  return count
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, practice, signOut } = useAuth()
  const terms = useTerms()
  const location = useLocation()
  const navigate = useNavigate()
  const count = useLessonCount(location.pathname)
  const paperwork = usePaperwork(location.pathname)
  const hasTools = useHasTools(location.pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMenuOpen(false), [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !userRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const doSignOut = async () => {
    const demo = practice?.isDemo
    await signOut().catch(() => {})
    navigate(demo ? '/demo' : '/signin', { replace: true })
  }

  // The lesson screen belongs to "My onboarding" in the nav.
  const onLesson = location.pathname.startsWith('/lesson/')
  const main: NavItem[] = [
    { to: '/', label: 'Home', Icon: HomeIcon, end: true },
    { to: '/onboarding', label: 'My onboarding', Icon: FlagIcon, count, forceActive: onLesson },
    ...(paperwork
      ? [{ to: '/paperwork', label: 'Paperwork', Icon: PenIcon, count: paperwork.open ? String(paperwork.open) : null, countLabel: `${paperwork.open} to complete` }]
      : []),
    ...(hasTools ? [{ to: '/tools', label: 'Tools', Icon: GridIcon }] : []),
    { to: '/resources', label: 'Resources', Icon: FolderIcon },
    { to: '/team', label: 'Team directory', Icon: TeamIcon },
    { to: '/support', label: 'Support', Icon: ChatIcon },
  ]
  const admin: NavItem[] = [
    { to: '/admin', label: 'Team progress', Icon: ChartIcon, end: true },
    { to: '/admin/team', label: 'Invites and roles', Icon: UserPlusIcon },
    { to: '/admin/videos', label: 'Videos', Icon: VideoIcon },
    { to: '/admin/content', label: 'Content', Icon: LayersIcon },
    { to: '/admin/paperwork', label: 'Paperwork', Icon: PenIcon },
    { to: '/admin/tools', label: 'Tools', Icon: GridIcon },
    ...(me?.role === 'owner' ? [{ to: '/admin/settings', label: `${cap(terms.org)} settings`, Icon: SettingsIcon }] : []),
  ]
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sb-top">
          <div className="sb-brand-row">
            <Link className="sb-brand" to="/">
              <BrandMark className="sb-logo" logoUrl={practice?.logoUrl} name={practice?.name ?? ''} />
              <span className="sb-brand__text">
                <span className="brand">{practice?.name ?? terms.portal}</span>
                <span className="brand-sub">{terms.portal}</span>
              </span>
            </Link>
            <button type="button" className="icon-btn sb-mobile-out" onClick={doSignOut} aria-label="Sign out">
              <SignOutIcon />
            </button>
          </div>
          <nav className="sb-navs" aria-label="Main">
            <NavList items={main} />
            {isAdminRole(me?.role) && (
              <>
                <p className="sb-section" aria-hidden="true">
                  Admin
                </p>
                <NavList items={admin} label="Admin" />
              </>
            )}
          </nav>
        </div>
        {me && (
          <div className="sb-user-wrap" ref={userRef}>
            {menuOpen && (
              <div className="user-menu" id={menuId}>
                <p className="body-xs user-menu__email">{me.email}</p>
                <Link className="user-menu__item" to="/account" onClick={() => setMenuOpen(false)}>
                  <LockIcon /> Your account and sign-in
                </Link>
                <button type="button" className="user-menu__item" onClick={doSignOut}>
                  <SignOutIcon /> Sign out
                </button>
              </div>
            )}
            <button
              type="button"
              className="sb-user"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Avatar initials={me.initials} />
              <span className="sb-user__text">
                <span className="row-title">{me.name}</span>
                <span className="body-xs">{me.title || roleName(me.role, terms.member)}</span>
              </span>
              <ChevronDownIcon size={14} />
              <span className="sr-only">Account menu</span>
            </button>
          </div>
        )}
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        {practice?.isDemo && <DemoBar />}
        {children}
      </main>
      {practice?.isDemo && <DemoTour />}
    </div>
  )
}

/** Role label. The member role is named by the organisation ("Clinician", "Team member"…). */
export const roleName = (r: string, member = 'team member') => (r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : cap(member))

/** Search field used in the dashboard top bar. Sends you to /onboarding?q=… */
export function SearchBox() {
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const id = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    navigate(term ? `/onboarding?q=${encodeURIComponent(term)}` : '/onboarding')
  }
  return (
    <form className="search" role="search" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        Search lessons and resources
      </label>
      <SearchIcon />
      <input id={id} type="search" placeholder="Search lessons and resources" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  )
}

/** The bell: real notifications (replies, new questions for admins, new lessons). Polls every minute. */
function Bell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ unread: number; items: AppNotification[] } | null>(null)
  const navigate = useNavigate()
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    let live = true
    const load = () => api.notifications().then((d) => { if (live) setData(d) }).catch(() => {})
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const go = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read) {
      setData((d) => d && { unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) })
      void api.readNotifications([n.id]).catch(() => {})
    }
    if (n.link) navigate(n.link)
  }
  const readAll = async () => {
    setData((d) => d && { unread: 0, items: d.items.map((i) => ({ ...i, read: true })) })
    await api.readNotifications().catch(() => {})
  }

  const unread = data?.unread ?? 0
  return (
    <div className="bell-wrap" ref={wrap}>
      <button
        type="button" className="round-btn" aria-expanded={open} aria-controls={id}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unread > 0 && <span className="bell-dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover popover--list" id={id}>
          <div className="popover__head">
            <p className="row-title-sm">Notifications</p>
            {unread > 0 && <button type="button" className="btn-ghost-text text-btn" onClick={() => void readAll()}>Mark all read</button>}
          </div>
          {!data?.items.length ? (
            <div className="popover__empty" role="status">
              <p className="row-title-sm">You’re all caught up.</p>
              <p className="body-xs">Answers to your questions and new lessons will show here.</p>
            </div>
          ) : (
            <ul className="notif-list">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif${n.read ? '' : ' notif--unread'}`} onClick={() => void go(n)}>
                    <p className="row-title-sm">{n.title}</p>
                    {n.body && <p className="body-xs">{n.body}</p>}
                    <p className="meta">{relativeDate(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Top bar: left slot (search or breadcrumbs) + "Need help?" + bell. */
export function TopBar({ left, bell = true }: { left?: ReactNode; bell?: boolean }) {
  return (
    <div className="topbar">
      {left ?? <SearchBox />}
      <div className="topbar__right">
        <Link className="help-link link-slate" to="/support">
          <ChatIcon /> <span>Need help?</span>
        </Link>
        {bell && <Bell />}
      </div>
    </div>
  )
}
