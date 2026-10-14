// Pick a lesson video three ways: paste a link (YouTube, Vimeo, Loom), upload a file, or record in Loom
// and paste its share link. Used on the Videos page and in the lesson editor.
import { useId, useRef, useState } from 'react'
import { uploadVideo } from '../api'
import { videoLabel, videoSource } from '../lib/format'

type Mode = 'link' | 'upload'

export function VideoField({ value, onChange, compact = false }: { value: string; onChange: (url: string) => void; compact?: boolean }) {
  const [mode, setMode] = useState<Mode>('link')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const label = videoLabel(value)
  const unknown = value.trim() !== '' && videoSource(value).kind === 'none'

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > 1024 * 1024 * 1024) return setError('That video is over 1 GB. Trim it, or upload it to YouTube or Loom and paste the link.')
    setProgress(0)
    try {
      const r = await uploadVideo(file, setProgress)
      onChange(r.url)
      setMode('link')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={`video-field ${compact ? 'video-field--compact' : ''}`}>
      <div className="seg" role="tablist" aria-label="Video source">
        <button type="button" role="tab" aria-selected={mode === 'link'} className={`seg__btn ${mode === 'link' ? 'is-active' : ''}`} onClick={() => setMode('link')}>Paste a link</button>
        <button type="button" role="tab" aria-selected={mode === 'upload'} className={`seg__btn ${mode === 'upload' ? 'is-active' : ''}`} onClick={() => setMode('upload')}>Upload a file</button>
      </div>

      {mode === 'link' ? (
        <div className="field">
          <label htmlFor={`${id}-url`} className="sr-only">Video link</label>
          <input
            id={`${id}-url`}
            className="input"
            type="text"
            inputMode="url"
            placeholder="Paste a YouTube, Vimeo or Loom link"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={unknown || undefined}
          />
          <p className="body-xs">
            {label ? <span className="video-field__ok">✓ {label}</span> : unknown ? <span className="form-error">That link isn’t a YouTube, Vimeo or Loom video.</span> : null}
            {!label && !unknown && (
              <>
                Recording in Loom? Record there,{' '}
                <a className="inline-link" href="https://www.loom.com/looms/videos" target="_blank" rel="noreferrer">open your Loom library ↗</a>, copy the share link and paste it here.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`${id}-file`} className="link-slate">Video file</label>
          <input
            ref={fileRef}
            id={`${id}-file`}
            className="input input--file"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            disabled={progress !== null}
            onChange={(e) => upload(e.target.files?.[0])}
          />
          {progress !== null ? (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Upload progress">
                <span className="bar__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="meta">Uploading… {Math.round(progress * 100)}%. Keep this tab open.</span>
            </div>
          ) : (
            <p className="body-xs">MP4, MOV or WebM, up to 1 GB.</p>
          )}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
