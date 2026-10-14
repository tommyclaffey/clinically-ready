// Typed fetch wrapper for the Clinical Onboarding API (SPEC §4).
// Every write sends `X-COA: 1`; cookies are same-origin only.

export type Role = 'owner' | 'admin' | 'clinician'
export type LessonStatus = 'not_started' | 'started' | 'complete'

export interface Me {
  id: number
  name: string
  email: string
  title: string
  role: Role
  initials: string
}

/** Words each organisation picks for itself (SPEC: practices.terms). */
export interface Terms {
  portal: string
  member: string
  members: string
  lead: string
  org: string
  checklist: string
  /** What the organisation calls its onboarding, e.g. "Clinical onboarding". Used on share cards. */
  onboarding: string
}

/** The organisation's own sign-in panel. Empty strings mean "use the plain panel". */
export interface Welcome {
  quote: string
  ref: string
  photoUrl: string
}

/** Which sign-in methods an organisation allows. */
export interface SignInMethods {
  password: boolean
  google: boolean
  microsoft: boolean
}
export type Provider = 'google' | 'microsoft'

export interface AccountInfo {
  email: string
  hasPassword: boolean
  identities: { provider: Provider; email: string; connectedAt: string }[]
  available: Record<Provider, boolean>
  allowed: SignInMethods
}

export interface Practice {
  id: number
  name: string
  slug: string
  brandColor: string
  logoUrl: string | null
  terms: Terms
  welcome: Welcome
  signIn: SignInMethods
  clientMessaging: ClientMessaging | null
  paperworkEnabled?: boolean
  /** A visitor's throwaway copy of the sample practice (the public demo). */
  isDemo?: boolean
}

/** What the public sign-in and invite pages know about an organisation (GET /api/orgs/:slug). */
export interface PublicOrg {
  name: string
  slug: string
  brandColor: string
  logoUrl: string
  terms: Terms
  welcome: Welcome
  signIn: SignInMethods
}

export interface Session {
  me: Me
  practice: Practice
}

export interface LessonCard {
  id: number
  title: string
  durationMin: number
  label: string
  status: LessonStatus
  posterUrl: string
  /** False for reading-only lessons. */
  hasVideo?: boolean
  /** The step's page has a video block, recorded or not. */
  videoPlanned?: boolean
  /** Additive server fields: number of downloads, and whether a quick check exists. */
  resourceCount?: number
  hasQuiz?: boolean
}

export interface Resource {
  id: number
  title: string
  fileType: string
  sizeLabel: string
  category: 'Resource' | 'Policy' | string
  lessonId: number | null
}

export interface ChecklistEntry {
  id: number
  title: string
  detail?: string
  section?: string
  done: boolean
}

/** A job position (e.g. Associate, Intern). Checklist items can belong to one. */
export interface JobPosition {
  id: number
  name: string
  position: number
  people: number
  items: number
}

export interface Person {
  id: number
  name: string
  title: string
  initials: string
}

export interface TeamMember extends Person {
  role: Role
}

/** One block of a lesson's reading. Plain text only. */
export type ContentBlock =
  | { type: 'h' | 'p' | 'quote' | 'callout'; text: string }
  | { type: 'list' | 'checklist' | 'steps'; items: string[] }
  | { type: 'dodont'; do: string[]; dont: string[] }

/** One block of a step's page. A step is built like a Notion page: any of these, in any order. */
export type PageBlock =
  | ContentBlock
  | { type: 'video'; url: string; transcript: string }
  | { type: 'takeaways'; items: string[] }
  | { type: 'links'; items: SourceLink[] }
  | { type: 'files' }
  | { type: 'quiz' }
  | { type: 'form'; formId: number }
  | { type: 'app'; appId: number }
  | { type: 'divider' }
export type PageBlockType = PageBlock['type']

/** A tool the team uses (SimplePractice, Slack, Notion…): open it, download it, bookmark it. */
export interface ToolApp {
  id: number
  name: string
  description: string
  iconUrl: string
  webUrl: string
  macUrl: string
  windowsUrl: string
  iosUrl: string
  androidUrl: string
  signinNote: string
  position: number
}
export type ToolInput = Partial<Omit<ToolApp, 'id' | 'position'>>

/** A section's end-of-section quiz, for one person. */
export interface SectionQuizStatus {
  drawCount: number
  passPercent: number
  poolSize: number
  passed: boolean
  bestPercent: number | null
  attempts: number
  /** Every step in the section is done, so the quiz can be taken. */
  ready: boolean
}
export interface SectionLock {
  weekId: number
  title: string
}
/** What every section carries for the learner: its quiz and whether it's locked behind an earlier one. */
export interface SectionGate {
  locked?: boolean
  lockedBy?: SectionLock | null
  quiz?: SectionQuizStatus | null
}

export interface QuizAttemptQuestion {
  n: number
  prompt: string
  options: string[]
  choice?: number
  correct?: boolean
  explanation?: string
  correctIndex?: number
}
export interface QuizAttempt {
  id: number
  weekId: number
  passPercent: number
  startedAt: string
  submittedAt: string | null
  total: number
  toPass: number
  correct: number | null
  percent: number | null
  passed: boolean | null
  questions: QuizAttemptQuestion[]
}
export interface NextSection {
  weekId: number
  title: string
  firstLessonId: number | null
}
export interface SectionQuizPage {
  section: { id: number; title: string; subtitle: string }
  quiz: SectionQuizStatus
  locked: boolean
  lockedBy: SectionLock | null
  attempt: QuizAttempt | null
  history: { id: number; percent: number; passed: boolean; submittedAt: string }[]
  next: NextSection | null
}

export interface PoolQuestion {
  id: number
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  asked: number
  right: number
}
export interface SectionQuizSettings {
  enabled: boolean
  active: boolean
  poolSize: number
  drawCount: number
  drawSetting: number
  passPercent: number
  passMarks?: number[]
}
export interface AdminSectionQuiz {
  section: { id: number; title: string; subtitle: string }
  settings: SectionQuizSettings
  questions: PoolQuestion[]
  stats: { tries: number; people: number; passed: number }
  importable: number
  added?: number
}
export interface QuestionInput {
  prompt?: string
  options?: string[]
  correctIndex?: number
  explanation?: string
}

/** A link to source material, e.g. the practice's Google Drive doc for a lesson. */
export interface SourceLink {
  label: string
  url: string
}

export interface PathWeek extends SectionGate {
  weekId: number
  title: string
  subtitle: string
  links?: SourceLink[]
  lessons: LessonCard[]
}

export interface Dashboard {
  me: Me
  practice: Practice
  /** The signed-in person's job position, if they have one. */
  position?: { id: number; name: string } | null
  progress: { done: number; total: number; percent: number; minutesLeft: number }
  continue: {
    lesson: LessonCard
    weekTitle: string
    position: { index: number; total: number }
    presenter: string
    overview: string
    positionSec?: number
  } | null
  path: PathWeek[]
  /** A quiz that's ready and not yet passed: the next thing to do. */
  quizDue?: (SectionQuizStatus & { weekId: number; title: string }) | null
  checklist: ChecklistEntry[]
  people: Person[]
  resources: Resource[]
}

export interface Week extends SectionGate {
  id: number
  title: string
  subtitle: string
  links?: SourceLink[]
  lessons: LessonCard[]
}

export interface Lesson {
  id: number
  weekId: number
  title: string
  links?: SourceLink[]
  content?: ContentBlock[]
  /** The page, in order. */
  blocks: PageBlock[]
  label: string
  presenter: string
  durationMin: number
  videoUrl: string
  posterUrl: string
  overview: string
  takeaways: string[]
  transcript: string
  updatedAt: string | null
}

export interface QuizQuestion {
  id: number
  prompt: string
  options: string[]
}

export interface LessonProgress {
  status: LessonStatus
  positionSec: number
  quizCorrect?: number | boolean | null
  completedAt?: string | null
}

export interface LessonDetail {
  lesson: Lesson
  week: { id: number; title: string; subtitle: string; links?: SourceLink[] }
  quiz: QuizQuestion[]
  resources: Resource[]
  progress: LessonProgress | null
  note: string
  noteUpdatedAt?: string | null
  prevId: number | null
  nextId: number | null
  position: { index: number; total: number }
  /** Paperwork placed on this page (only what this person is asked to do). */
  forms: MyForm[]
  /** Tools placed on this page. */
  apps: ToolApp[]
  /** This section's quiz (null when it has none). */
  sectionQuiz?: SectionQuizStatus | null
  /** This is the section's last step and its quiz is still to pass. */
  quizNext?: boolean
}

export interface QuizAnswer {
  correct: boolean
  correctIndex: number
  explanation: string
}

export interface InviteInfo {
  email: string
  name: string
  practiceName: string
  terms?: Terms
  org?: PublicOrg
}

// ---------- Admin ----------

export interface AdminUser extends TeamMember {
  email: string
  active: boolean | number
  progressPercent: number
  lessonsDone: number
  checklistDone: number
  lessonsTotal?: number
  checklistTotal?: number
  lastSeenAt: string | null
  signsInWith?: ('password' | Provider)[]
  positionId?: number | null
  positionName?: string | null
  paperworkDone?: number
  paperworkTotal?: number
}

export interface PendingInvite {
  email: string
  name: string
  title: string
  role: Role
  positionId?: number | null
  createdAt?: string
  expiresAt?: string
}

export type FormKind = 'sign' | 'upload'
export type FormStatus = 'todo' | 'resign' | 'done'

export interface Submission {
  id: number
  version: number
  typedName: string
  submittedAt: string
  hasFile: boolean
  fileDeletedAt: string | null
  fileType: string
  sizeBytes: number
}

/** A piece of onboarding paperwork: an agreement to sign, or a form to fill in and upload. */
export interface PaperworkForm {
  id: number
  kind: FormKind
  title: string
  body: string
  templateUrl: string
  positionId: number | null
  positionName: string | null
  required: boolean
  active: boolean
  version: number
  updatedAt: string
}

export interface MyForm extends PaperworkForm {
  status: FormStatus
  submission: Submission | null
}

export interface AdminForm extends PaperworkForm {
  assigned: number
  done: number
}

export interface AdminForms {
  paperworkEnabled: boolean
  secureStorage: boolean
  forms: AdminForm[]
}

export interface FormInput {
  kind?: FormKind
  title?: string
  body?: string
  templateUrl?: string
  positionId?: number | null
  required?: boolean
  active?: boolean
}

export interface SignedRecord extends Submission {
  title: string
  body: string
  bodyHash: string
  signer: { name: string; email: string }
  ip?: string
  userAgent?: string
}

export interface QuizResult {
  id: number
  prompt: string
  answered: boolean
  attempts: number
  correct: boolean | null
  firstTry: boolean | null
  answer: string
  rightAnswer: string
  answeredAt: string | null
}

export interface PersonRecord {
  person: { id: number; name: string; email: string; title: string; role: Role; initials: string; active: boolean; positionName: string | null; createdAt: string; lastSeenAt: string | null }
  summary: {
    lessonsDone: number; lessonsTotal: number; quizAnswered: number; quizCorrect: number; quizTotal: number
    checklistDone: number; checklistTotal: number; paperworkDone: number; paperworkTotal: number
    sectionQuizzesPassed?: number; sectionQuizzesTotal?: number
  }
  sections: { id: number; title: string; subtitle: string; sectionQuiz?: { passPercent: number; passed: boolean; tries: number; best: number | null; history: { percent: number; passed: boolean; at: string }[] } | null; lessons: { id: number; title: string; status: LessonStatus; completedAt: string | null; quiz: QuizResult[]; quizPassed: boolean | null }[] }[]
  checklist: { id: number; title: string; section: string; done: boolean; doneAt: string | null }[]
  paperwork: { id: number; kind: FormKind; title: string; required: boolean; status: FormStatus; submission: Submission | null }[]
}

export interface AdminTeam {
  users: AdminUser[]
  invites: PendingInvite[]
}

export interface QuizDraft {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface AdminLesson extends Lesson {
  position: number
  quiz?: (QuizDraft & { id?: number })[]
}

export interface AdminWeek {
  quiz?: SectionQuizSettings
  id: number
  title: string
  subtitle: string
  links?: SourceLink[]
  position: number
  lessons: AdminLesson[]
}

export interface AdminChecklistItem {
  id: number
  title: string
  detail: string
  section?: string
  positionId?: number | null
  position: number
}

export interface AdminContent {
  weeks: AdminWeek[]
  checklist: AdminChecklistItem[]
  positions?: JobPosition[]
  resources: Resource[]
}

/** One message in a question's thread. */
export interface Reply {
  id: number
  body: string
  authorName: string
  authorInitials: string
  fromAsker: boolean
  mine: boolean
  createdAt: string
}

export interface AppNotification {
  id: number
  kind: 'question' | 'reply' | 'followup' | 'lesson' | string
  title: string
  body: string
  link: string
  createdAt: string
  read: boolean
}

/** Where questions about clients go instead (e.g. SimplePractice). */
export interface ClientMessaging {
  label: string
  url: string
}

export interface AdminQuestion {
  id: number
  body: string
  replies?: Reply[]
  createdAt: string
  resolvedAt: string | null
  askerName: string
  lessonId: number | null
  lessonTitle: string | null
}

export interface MyQuestion {
  id: number
  body: string
  replies?: Reply[]
  lessonId: number | null
  lessonTitle: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface WeekInput {
  title: string
  subtitle: string
  position?: number
  links?: SourceLink[]
}

export interface LessonInput {
  weekId?: number
  title?: string
  label?: string
  presenter?: string
  durationMin?: number
  videoUrl?: string
  posterUrl?: string
  overview?: string
  takeaways?: string[]
  transcript?: string
  position?: number
  links?: SourceLink[]
  blocks?: PageBlock[]
  notify?: boolean
}

export interface ChecklistInput {
  title: string
  detail: string
  position: number
  section?: string
  positionId?: number | null
}

// ---------- Core request ----------

export class ApiError extends Error {
  status: number
  /** The rest of the error body, e.g. `locked` when a section is behind a quiz. */
  data: Record<string, unknown>
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

/** The auth provider registers this so any 401 drops the user back to /signin. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  /** Raw body (file upload). Sent as-is with the given content type. */
  raw?: Blob | ArrayBuffer
  contentType?: string
  /** Don't trigger the global 401 handler (sign-in form, /api/me probe). */
  quiet401?: boolean
}

export async function request<T>(method: Method, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: BodyInit | undefined
  if (method !== 'GET') headers['X-COA'] = '1'
  if (opts.raw !== undefined) {
    payload = opts.raw
    headers['Content-Type'] = opts.contentType || 'application/octet-stream'
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }

  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Something went wrong (${res.status}).`
    if (res.status === 401 && !opts.quiet401 && onUnauthorized) onUnauthorized()
    if (res.status === 413 && !(data && typeof data === 'object' && 'error' in data)) {
      throw new ApiError('That file is too large. The limit is 25 MB.', 413)
    }
    throw new ApiError(msg, res.status, data && typeof data === 'object' ? (data as Record<string, unknown>) : {})
  }
  return data as T
}

const enc = encodeURIComponent

// ---------- Endpoints ----------

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<Session>('POST', '/api/auth/login', { email, password }, { quiet401: true }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<Session>('GET', '/api/me', undefined, { quiet401: true }),
  signup: (b: { practiceName: string; name: string; email: string; password: string }) =>
    request<Session>('POST', '/api/signup', b),
  providers: () => request<Record<Provider, boolean>>('GET', '/api/auth/providers', undefined, { quiet401: true }),
  account: () => request<AccountInfo>('GET', '/api/account'),
  disconnect: (p: Provider) => request<{ ok: true }>('DELETE', `/api/account/identities/${p}`),
  changePassword: (b: { current?: string; next: string }) => request<{ ok: true }>('PUT', '/api/account/password', b),
  org: (slug: string) => request<PublicOrg>('GET', `/api/orgs/${enc(slug)}`, undefined, { quiet401: true }),
  invite: (token: string) => request<InviteInfo>('GET', `/api/invites/${enc(token)}`, undefined, { quiet401: true }),
  acceptInvite: (token: string, b: { name: string; password: string }) =>
    request<Session>('POST', `/api/invites/${enc(token)}/accept`, b, { quiet401: true }),

  // Public demo
  demoStart: (as: 'clinician' | 'owner') => request<Session>('POST', '/api/demo/start', { as }, { quiet401: true }),
  demoSwitch: () => request<Session>('POST', '/api/demo/switch'),

  // Learner
  dashboard: () => request<Dashboard>('GET', '/api/dashboard'),
  weeks: () => request<Week[]>('GET', '/api/weeks'),
  lesson: (id: number | string) => request<LessonDetail>('GET', `/api/lessons/${enc(String(id))}`),
  saveProgress: (id: number, positionSec: number) =>
    request<{ ok: boolean }>('POST', `/api/lessons/${id}/progress`, { positionSec: Math.floor(positionSec) }),
  complete: (id: number) => request<{ ok: boolean; nextId: number | null; quizWeekId?: number | null }>('POST', `/api/lessons/${id}/complete`),
  sectionQuiz: (weekId: number | string) => request<SectionQuizPage>('GET', `/api/sections/${enc(String(weekId))}/quiz`),
  startQuiz: (weekId: number) => request<{ attempt: QuizAttempt }>('POST', `/api/sections/${weekId}/quiz/start`),
  submitQuiz: (attemptId: number, answers: number[]) => request<{ attempt: QuizAttempt; next: NextSection | null }>('POST', `/api/quiz-attempts/${attemptId}/submit`, { answers }),
  answer: (questionId: number, index: number) => request<QuizAnswer>('POST', `/api/quiz/${questionId}/answer`, { index }),
  saveNote: (lessonId: number, body: string) =>
    request<{ ok: boolean; updatedAt: string }>('PUT', `/api/lessons/${lessonId}/note`, { body }),
  setChecklist: (id: number, done: boolean) => request<{ ok: boolean }>('POST', `/api/checklist/${id}`, { done }),
  resources: () => request<Resource[]>('GET', '/api/resources'),
  team: () => request<TeamMember[]>('GET', '/api/team'),
  ask: (body: string, lessonId?: number | null) =>
    request<{ ok: boolean }>('POST', '/api/questions', lessonId ? { body, lessonId } : { body }),
  /** The signed-in user's own questions (server addition, not in SPEC §4 table). */
  myQuestions: () => request<MyQuestion[]>('GET', '/api/questions'),
  reply: (questionId: number, body: string) => request<{ ok: true; id: number }>('POST', `/api/questions/${questionId}/replies`, { body }),
  notifications: () => request<{ unread: number; items: AppNotification[] }>('GET', '/api/notifications'),
  readNotifications: (ids?: number[]) => request<{ ok: true }>('POST', '/api/notifications/read', ids ? { ids } : {}),

  // Admin
  adminTeam: () => request<AdminTeam>('GET', '/api/admin/team'),
  createInvite: (b: { email: string; name: string; title: string; role: Role; positionId?: number | null }) =>
    request<{ inviteUrl: string; expiresAt?: string }>('POST', '/api/admin/invites', b),
  revokeInvite: (email: string) => request<{ ok: boolean }>('DELETE', `/api/admin/invites/${enc(email)}`),
  updateUser: (id: number, b: { role?: Role; title?: string; active?: boolean; positionId?: number | null }) =>
    request<unknown>('PUT', `/api/admin/users/${id}`, b),
  adminContent: () => request<AdminContent>('GET', '/api/admin/content'),
  createWeek: (b: WeekInput) => request<unknown>('POST', '/api/admin/weeks', b),
  updateWeek: (id: number, b: WeekInput) => request<unknown>('PUT', `/api/admin/weeks/${id}`, b),
  deleteWeek: (id: number) => request<unknown>('DELETE', `/api/admin/weeks/${id}`),
  createLesson: (b: LessonInput) => request<unknown>('POST', '/api/admin/lessons', b),
  updateLesson: (id: number, b: LessonInput) => request<unknown>('PUT', `/api/admin/lessons/${id}`, b),
  setLessonVideo: (id: number, b: { videoUrl: string; posterUrl?: string }) => request<{ lesson: AdminLesson }>('PUT', `/api/admin/lessons/${id}`, b),
  saveOutline: (sections: { id: number; lessonIds: number[] }[]) => request<{ ok: true }>('PUT', '/api/admin/outline', { sections }),
  deleteLesson: (id: number) => request<unknown>('DELETE', `/api/admin/lessons/${id}`),
  saveQuiz: (lessonId: number, quiz: QuizDraft[]) => request<unknown>('PUT', `/api/admin/lessons/${lessonId}/quiz`, quiz),
  uploadResource: (file: File, meta: { title: string; category: string; lessonId?: number | null }) => {
    const q = new URLSearchParams({
      title: meta.title,
      category: meta.category,
      lessonId: meta.lessonId ? String(meta.lessonId) : '',
      filename: file.name,
    })
    return request<unknown>('POST', `/api/admin/resources?${q.toString()}`, undefined, {
      raw: file,
      contentType: file.type || 'application/octet-stream',
    })
  },
  deleteResource: (id: number) => request<unknown>('DELETE', `/api/admin/resources/${id}`),
  createChecklist: (b: ChecklistInput) => request<unknown>('POST', '/api/admin/checklist', b),
  updateChecklist: (id: number, b: ChecklistInput) => request<unknown>('PUT', `/api/admin/checklist/${id}`, b),
  deleteChecklist: (id: number) => request<unknown>('DELETE', `/api/admin/checklist/${id}`),
  positions: () => request<JobPosition[]>('GET', '/api/admin/positions'),
  createPosition: (name: string) => request<{ ok: true; id: number; positions: JobPosition[] }>('POST', '/api/admin/positions', { name }),
  renamePosition: (id: number, name: string) => request<{ ok: true; positions: JobPosition[] }>('PUT', `/api/admin/positions/${id}`, { name }),
  deletePosition: (id: number) => request<{ ok: true; positions: JobPosition[] }>('DELETE', `/api/admin/positions/${id}`),
  adminQuestions: () => request<AdminQuestion[] | { open: AdminQuestion[]; resolved: AdminQuestion[] }>('GET', '/api/admin/questions'),
  resolveQuestion: (id: number) => request<unknown>('POST', `/api/admin/questions/${id}/resolve`),
  updatePractice: (b: { name: string; brandColor: string; logoUrl: string; terms?: Partial<Terms>; welcome?: Partial<Welcome>; signInMethods?: Partial<SignInMethods>; clientMessaging?: ClientMessaging | null }) =>
    request<unknown>('PUT', '/api/admin/practice', b),
  setPaperworkEnabled: (on: boolean) => request<{ ok: true }>('PUT', '/api/admin/practice', { paperworkEnabled: on }),

  // Paperwork
  myForms: () => request<MyForm[]>('GET', '/api/forms'),
  signForm: (id: number, b: { typedName: string; consent: boolean; version: number }) => request<{ ok: true; id: number; signedAt: string }>('POST', `/api/forms/${id}/sign`, b),
  uploadForm: (id: number, file: File) =>
    request<{ ok: true }>('POST', `/api/forms/${id}/upload?filename=${enc(file.name)}`, undefined, { raw: file, contentType: file.type || 'application/octet-stream' }),
  submission: (id: number) => request<SignedRecord>('GET', `/api/submissions/${id}`),
  adminForms: () => request<AdminForms>('GET', '/api/admin/forms'),
  createForm: (b: FormInput) => request<{ ok: true; id: number }>('POST', '/api/admin/forms', b),
  updateForm: (id: number, b: FormInput) => request<{ ok: true; version: number }>('PUT', `/api/admin/forms/${id}`, b),
  deleteForm: (id: number) => request<{ ok: true; archived: boolean }>('DELETE', `/api/admin/forms/${id}`),
  deleteSubmissionFile: (id: number) => request<{ ok: true }>('DELETE', `/api/admin/submissions/${id}/file`),

  // Section quizzes (admin)
  adminSectionQuiz: (weekId: number | string) => request<AdminSectionQuiz>('GET', `/api/admin/sections/${enc(String(weekId))}/quiz`),
  setSectionQuiz: (weekId: number, b: { enabled?: boolean; drawCount?: number; passPercent?: number }) => request<AdminSectionQuiz>('PUT', `/api/admin/sections/${weekId}/quiz`, b),
  addPoolQuestion: (weekId: number, b: QuestionInput) => request<AdminSectionQuiz>('POST', `/api/admin/sections/${weekId}/questions`, b),
  importPoolQuestions: (weekId: number) => request<AdminSectionQuiz>('POST', `/api/admin/sections/${weekId}/questions/import`),
  updatePoolQuestion: (id: number, b: QuestionInput) => request<AdminSectionQuiz>('PUT', `/api/admin/section-questions/${id}`, b),
  deletePoolQuestion: (id: number) => request<AdminSectionQuiz>('DELETE', `/api/admin/section-questions/${id}`),

  // Tools
  apps: () => request<ToolApp[]>('GET', '/api/apps'),
  createApp: (b: ToolInput) => request<{ ok: true; id: number; apps: ToolApp[] }>('POST', '/api/admin/apps', b),
  updateApp: (id: number, b: ToolInput & { position?: number }) => request<{ ok: true; apps: ToolApp[] }>('PUT', `/api/admin/apps/${id}`, b),
  deleteApp: (id: number) => request<{ ok: true; apps: ToolApp[] }>('DELETE', `/api/admin/apps/${id}`),

  // Results
  person: (id: number | string) => request<PersonRecord>('GET', `/api/admin/people/${enc(String(id))}`),
}

export const submissionFileUrl = (id: number) => `/api/admin/submissions/${id}/file`
export const RESULTS_CSV_URL = '/api/admin/results.csv'

/** Upload a lesson video with progress (fetch can't report upload progress, so XHR). */
export function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<{ id: number; url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/admin/videos?filename=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('X-COA', '1')
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      let data: { id?: number; url?: string; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve({ id: data.id!, url: data.url })
      else reject(new Error(data.error || `Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Could not reach the server. Check your connection and try again.'))
    xhr.send(file)
  })
}

export const downloadUrl = (resourceId: number) => `/api/resources/${resourceId}/download`

/** Normalises the admin questions payload (array, or {open, resolved}) and tolerates field-name drift. */
export function normalizeQuestions(
  raw: AdminQuestion[] | { open: AdminQuestion[]; resolved: AdminQuestion[] } | null | undefined,
): AdminQuestion[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [...(raw.open ?? []), ...(raw.resolved ?? [])]
  return list.map((q) => {
    const r = q as AdminQuestion & Record<string, unknown>
    const asker = r.asker as { name?: string } | undefined
    return {
      ...q,
      askerName: (r.askerName ?? r.userName ?? r.name ?? asker?.name ?? 'Someone') as string,
      lessonTitle: (r.lessonTitle ?? null) as string | null,
      resolvedAt: (r.resolvedAt ?? null) as string | null,
    }
  })
}
