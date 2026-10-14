import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, PublicOnly } from './auth'
import { Shell } from './components/Shell'
import { InvitePage, SignInPage, SignUpPage } from './pages/AuthPages'
import { DashboardPage } from './pages/Dashboard'
import { LessonPage } from './pages/Lesson'
import { OnboardingPage } from './pages/Onboarding'
import { ResourcesPage } from './pages/Resources'
import { SupportPage } from './pages/Support'
import { TeamPage } from './pages/Team'
import { AccountPage } from './pages/Account'
import { AdminContentPage } from './pages/admin/AdminContent'
import { AdminStepPage } from './pages/admin/StepEditor'
import { AdminHomePage } from './pages/admin/AdminHome'
import { AdminSettingsPage } from './pages/admin/AdminSettings'
import { AdminTeamPage } from './pages/admin/AdminTeam'
import { AdminVideosPage } from './pages/admin/AdminVideos'
import { AdminPaperworkPage } from './pages/admin/AdminPaperwork'
import { AdminPersonPage } from './pages/admin/AdminPerson'
import { PaperworkPage, SignedRecordPage } from './pages/Paperwork'
import { ToolsPage } from './pages/Tools'
import { DemoPage } from './pages/Demo'
import { SectionQuizPage } from './pages/SectionQuiz'
import { AdminSectionQuizPage } from './pages/admin/AdminSectionQuiz'
import { AdminToolsPage } from './pages/admin/AdminTools'
import type { Role } from './api'
import type { ReactNode } from 'react'

const ADMIN: Role[] = ['owner', 'admin']

function App({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  return (
    <RequireAuth roles={roles}>
      <Shell>{children}</Shell>
    </RequireAuth>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUpPage /></PublicOnly>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/" element={<App><DashboardPage /></App>} />
      <Route path="/onboarding" element={<App><OnboardingPage /></App>} />
      <Route path="/lesson/:id" element={<App><LessonPage /></App>} />
      <Route path="/resources" element={<App><ResourcesPage /></App>} />
      <Route path="/team" element={<App><TeamPage /></App>} />
      <Route path="/support" element={<App><SupportPage /></App>} />
      <Route path="/account" element={<App><AccountPage /></App>} />
      <Route path="/quiz/:weekId" element={<App><SectionQuizPage /></App>} />
      <Route path="/admin/content/quiz/:weekId" element={<App roles={ADMIN}><AdminSectionQuizPage /></App>} />
      <Route path="/tools" element={<App><ToolsPage /></App>} />
      <Route path="/admin/tools" element={<App roles={ADMIN}><AdminToolsPage /></App>} />
      <Route path="/paperwork" element={<App><PaperworkPage /></App>} />
      <Route path="/paperwork/record/:id" element={<App><SignedRecordPage /></App>} />
      <Route path="/admin/people/:id" element={<App roles={ADMIN}><AdminPersonPage /></App>} />
      <Route path="/admin/paperwork" element={<App roles={ADMIN}><AdminPaperworkPage /></App>} />
      <Route path="/admin" element={<App roles={ADMIN}><AdminHomePage /></App>} />
      <Route path="/admin/team" element={<App roles={ADMIN}><AdminTeamPage /></App>} />
      <Route path="/admin/content" element={<App roles={ADMIN}><AdminContentPage /></App>} />
      <Route path="/admin/content/step/:id" element={<App roles={ADMIN}><AdminStepPage /></App>} />
      <Route path="/admin/content/new" element={<App roles={ADMIN}><AdminStepPage /></App>} />
      <Route path="/admin/videos" element={<App roles={ADMIN}><AdminVideosPage /></App>} />
      <Route path="/admin/settings" element={<App roles={['owner']}><AdminSettingsPage /></App>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
