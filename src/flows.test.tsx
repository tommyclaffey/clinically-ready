// UI flows with fetch mocked: sign-in error text, quiz grading, and the X-COA header on writes.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AuthProvider } from './auth'
import { QuickCheck } from './components/QuickCheck'
import { SignInPage } from './pages/AuthPages'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('sign in', () => {
  test('shows the server error on a wrong password and sends X-COA on the write', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return json(401, { error: 'Sign in first.' })
      if (url === '/api/auth/login') {
        expect((init?.headers as Record<string, string>)['X-COA']).toBe('1')
        return json(401, { error: 'Email or password is incorrect' })
      }
      return json(404, { error: 'Not found' })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/signin']}>
        <AuthProvider>
          <SignInPage />
        </AuthProvider>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@thewell.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password is incorrect')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/auth/login')).toBe(true)
  })
})

describe('quick check', () => {
  test('grades the answer and shows the explanation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { correct: false, correctIndex: 0, explanation: 'The client sets the pace.' })))
    render(<QuickCheck quiz={[{ id: 7, prompt: 'What do you do?', options: ['Respect it', 'Ignore it'] }]} />)
    fireEvent.click(screen.getByLabelText('Ignore it'))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    await waitFor(() => expect(screen.getByText(/The client sets the pace\./)).toBeTruthy())
  })
})

describe('question threads', () => {
  test('ReplyForm posts the reply (with X-COA) and calls onSent', async () => {
    const { ReplyForm, Replies } = await import('./components/Thread')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['X-COA']).toBe('1')
      expect(JSON.parse(String(init?.body))).toEqual({ body: 'Thursday at 2.' })
      return json(200, { ok: true, id: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const onSent = vi.fn()
    render(<ReplyForm questionId={12} label="Reply to Jordan" onSent={onSent} />)
    fireEvent.change(screen.getByLabelText('Reply to Jordan'), { target: { value: '  Thursday at 2.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reply to Jordan' }))
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/questions/12/replies')
    cleanup()
    render(<Replies replies={[{ id: 1, body: 'Hi', authorName: 'Dr. Angela Claffey', authorInitials: 'AC', fromAsker: false, mine: true, createdAt: new Date().toISOString() }]} />)
    expect(screen.getByText(/^You/)).toBeTruthy()
  })
})
