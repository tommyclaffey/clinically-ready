import { useEffect, useRef } from 'react'
import { api } from '../api'
import { posterFor } from '../lib/brand'
import { useAuth } from '../auth'
import { videoSource } from '../lib/format'

const SAVE_EVERY_MS = 15_000

/**
 * Lesson video. .mp4 -> <video controls>; YouTube/Vimeo -> iframe embed;
 * empty -> poster with dark overlay and "Video coming soon".
 * Saves position every 15s while playing and on pause (file videos only).
 */
export function Player({
  lessonId, title, videoUrl, posterUrl, startAt = 0, trackProgress = true,
}: {
  lessonId: number
  title: string
  videoUrl: string
  posterUrl: string
  startAt?: number
  /** Only the step's main video saves the resume position. */
  trackProgress?: boolean
}) {
  const src = videoSource(videoUrl)
  const ref = useRef<HTMLVideoElement>(null)
  const lastSave = useRef(0)
  const lastPos = useRef(-1)

  const save = (force = false) => {
    const v = ref.current
    if (!v || !trackProgress) return
    const now = Date.now()
    const pos = Math.floor(v.currentTime)
    if (!force && now - lastSave.current < SAVE_EVERY_MS) return
    if (pos === lastPos.current) return
    lastSave.current = now
    lastPos.current = pos
    api.saveProgress(lessonId, pos).catch(() => {})
  }

  // Save on unmount if the video was mid-play.
  useEffect(() => {
    const v = ref.current
    return () => {
      if (trackProgress && v && !v.paused && v.currentTime > 0) api.saveProgress(lessonId, v.currentTime).catch(() => {})
    }
  }, [lessonId, trackProgress])

  const { practice } = useAuth()
  const poster = posterUrl || posterFor(practice?.slug)

  if (src.kind === 'file') {
    return (
      <div className="player">
        <video
          ref={ref}
          key={src.src}
          src={src.src}
          poster={poster}
          controls
          preload="metadata"
          playsInline
          aria-label={`Lesson video: ${title}`}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (startAt > 0 && startAt < v.duration - 2) v.currentTime = startAt
          }}
          onPlay={() => {
            lastSave.current = Date.now()
            save(true)
          }}
          onTimeUpdate={(e) => {
            if (!e.currentTarget.paused) save()
          }}
          onPause={() => save(true)}
          onEnded={() => save(true)}
        />
      </div>
    )
  }

  if (src.kind === 'embed') {
    return (
      <div className="player">
        <iframe
          src={src.src}
          title={`Lesson video: ${title}`}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="player player--soon">
      <img src={poster} alt="" />
      <div className="player__shade" aria-hidden="true" />
      <div className="player__soon">
        <p className="card-serif-light">Video coming soon</p>
        <p className="meta-light">The rest of this step is below in the meantime.</p>
      </div>
    </div>
  )
}
