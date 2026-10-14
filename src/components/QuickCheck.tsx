import { useId, useState } from 'react'
import { api, type QuizAnswer, type QuizQuestion } from '../api'
import { plural } from '../lib/format'
import { CheckIcon, CloseIcon } from './Icons'

/** The "Quick check" card: one block per question, radio options, Check answer -> result + explanation. */
export function QuickCheck({ quiz }: { quiz: QuizQuestion[] }) {
  if (!quiz.length) return null
  return (
    <section className="card quick-check" aria-labelledby="qc-title">
      <div className="qc-head">
        <h2 id="qc-title" className="card-serif">Quick check</h2>
        <p className="meta">{plural(quiz.length, 'question')}</p>
      </div>
      {quiz.map((q) => <Question key={q.id} q={q} />)}
    </section>
  )
}

function Question({ q }: { q: QuizQuestion }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<QuizAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = useId()
  const promptId = useId()

  const check = async () => {
    if (picked === null) {
      setError('Pick an answer first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResult(await api.answer(q.id, picked))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="qc-q">
      <legend id={promptId} className="row-title">{q.prompt}</legend>
      <div className="qc-opts">
        {q.options.map((opt, i) => {
          const isPicked = picked === i
          const isCorrect = result !== null && result.correctIndex === i
          const isWrong = result !== null && isPicked && !result.correct
          const cls = ['qc-opt', isPicked && 'is-picked', isCorrect && 'is-correct', isWrong && 'is-wrong'].filter(Boolean).join(' ')
          return (
            <label key={i} className={cls}>
              <input
                type="radio"
                className="sr-only-input"
                name={name}
                value={i}
                checked={isPicked}
                onChange={() => {
                  setPicked(i)
                  setResult(null)
                  setError(null)
                }}
              />
              <span className="qc-radio" aria-hidden="true"><span /></span>
              <span className="body-sm-dark">{opt}</span>
              {isCorrect && <span className="qc-tag qc-tag--ok">Correct answer</span>}
            </label>
          )
        })}
      </div>
      <div className="qc-result" aria-live="polite" role="status">
        {result && (
          <div className={`qc-feedback ${result.correct ? 'is-ok' : 'is-no'}`}>
            <span className="qc-feedback__icon" aria-hidden="true">{result.correct ? <CheckIcon /> : <CloseIcon />}</span>
            <div>
              <p className="row-title-sm">{result.correct ? 'Correct.' : 'Not quite.'}</p>
              {result.explanation && <p className="body-sm-dark">{result.explanation}</p>}
            </div>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
      <div>
        <button type="button" className="btn btn--ghost" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : result ? 'Check again' : 'Check answer'}
        </button>
      </div>
    </fieldset>
  )
}
