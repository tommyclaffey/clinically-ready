// Per-organisation wording. The app is industry-neutral; each organisation picks its own words
// (a therapy practice says "clinician" and "supervisor", a company says "team member" and "manager").
import type { Terms } from '../api'
import { useAuth } from '../auth'

export const DEFAULT_TERMS: Terms = {
  portal: 'Team portal',
  member: 'team member',
  members: 'team members',
  lead: 'manager',
  org: 'company',
  checklist: 'Before your first day',
  onboarding: 'Onboarding',
}

export const PRESETS: { id: string; label: string; terms: Terms }[] = [
  { id: 'general', label: 'Company', terms: DEFAULT_TERMS },
  {
    id: 'therapy',
    label: 'Counselling or therapy practice',
    terms: { portal: 'Clinician portal', member: 'clinician', members: 'clinicians', lead: 'supervisor', org: 'practice', checklist: 'Before your first client', onboarding: 'Clinical onboarding' },
  },
  {
    id: 'church',
    label: 'Church or ministry',
    terms: { portal: 'Staff portal', member: 'staff member', members: 'staff', lead: 'pastor', org: 'church', checklist: 'Before your first Sunday', onboarding: 'Staff onboarding' },
  },
  {
    id: 'trades',
    label: 'Trades or field crew',
    terms: { portal: 'Crew portal', member: 'crew member', members: 'crew', lead: 'foreman', org: 'company', checklist: 'Before your first job', onboarding: 'Crew onboarding' },
  },
]

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export const termsOf = (t?: Partial<Terms> | null): Terms => ({ ...DEFAULT_TERMS, ...(t ?? {}) })

/** The signed-in organisation's words, with defaults before sign-in. */
export function useTerms(): Terms {
  const { practice } = useAuth()
  return termsOf(practice?.terms)
}
