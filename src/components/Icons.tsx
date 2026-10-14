// Small inline icon set. 16px, 1.5px strokes, currentColor. Decorative by default (aria-hidden).
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 7.2 8 2.5l5.5 4.7V13a.5.5 0 0 1-.5.5H9.75V10h-3.5v3.5H3a.5.5 0 0 1-.5-.5Z" /></Svg>
)
export const FlagIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 14V2.5" /><path d="M3.5 3h8l-1.6 2.75L11.5 8.5h-8" /></Svg>
)
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M1.75 4.25c0-.55.45-1 1-1h3.4l1.4 1.5h5.7c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1Z" /></Svg>
)
export const TeamIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13.25c.4-2.2 2.1-3.5 4.25-3.5s3.85 1.3 4.25 3.5" />
    <path d="M10.5 3.4a2.25 2.25 0 0 1 0 4.2M11.6 9.9c1.4.4 2.4 1.5 2.65 3.35" />
  </Svg>
)
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.25 3.75c0-.55.45-1 1-1h9.5c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H7l-3 2.5v-2.5h-.75c-.55 0-1-.45-1-1Z" /></Svg>
)
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.25 3.25" /></Svg>
)
export const BellIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1.25H3Z" /><path d="M6.5 14.25a1.6 1.6 0 0 0 3 0" /></Svg>
)
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.25v8M4.75 7.25 8 10.5l3.25-3.25M2.75 13.5h10.5" /></Svg>
)
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m3.25 8.25 3 3 6.5-6.5" /></Svg>
)
export const LockIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" /></Svg>
)
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="m4 6 4 4 4-4" /></Svg>
)
export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.75 8h10.5M9.5 4.25 13.25 8 9.5 11.75" /></Svg>
)
export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13.25 8H2.75M6.5 4.25 2.75 8l3.75 3.75" /></Svg>
)
export const SignOutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 13.5H3.25a.75.75 0 0 1-.75-.75V3.25c0-.4.35-.75.75-.75H6.5" /><path d="M10.25 5 13.25 8l-3 3M13.25 8H6" /></Svg>
)
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 13.5h11" /><path d="M4.5 11V8M8 11V4.5M11.5 11V6.5" /></Svg>
)
export const UserPlusIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="6.5" cy="5.5" r="2.5" /><path d="M2 13.5c.45-2.4 2.2-3.75 4.5-3.75 1.1 0 2.05.3 2.8.85M12.25 9v4.5M10 11.25h4.5" /></Svg>
)
export const LayersIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.25 14 5.5 8 8.75 2 5.5Z" /><path d="m2 8.25 6 3.25 6-3.25M2 11l6 3.25L14 11" /></Svg>
)
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6" />
  </Svg>
)
export const PenIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10.5 2.5 13.5 5.5 6 13H3v-3Z" /><path d="M9 4l3 3" /></Svg>
)
export const VideoIcon = (p: IconProps) => (
  <Svg {...p}><rect x="1.75" y="4" width="9" height="8" rx="1.5" /><path d="m10.75 7 3.5-2v6l-3.5-2" /></Svg>
)
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>
)
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 9c.03.4.37.75.78.75h5.24c.41 0 .75-.34.78-.75l.6-9" /></Svg>
)
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" /><path d="M10.75 5.25V3.5c0-.7-.55-1.25-1.25-1.25H3.5c-.7 0-1.25.55-1.25 1.25v6c0 .7.55 1.25 1.25 1.25h1.75" /></Svg>
)
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="m3.75 3.75 8.5 8.5M12.25 3.75l-8.5 8.5" /></Svg>
)
export const UploadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 10.75v-8.5M4.75 5.5 8 2.25l3.25 3.25M2.75 13.5h10.5" /></Svg>
)
export const EditIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10.5 2.75 13.25 5.5 5.5 13.25H2.75V10.5Z" /><path d="m9 4.25 2.75 2.75" /></Svg>
)
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 13.25V2.75M4.25 6.5 8 2.75l3.75 3.75" /></Svg>
)
export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.75v10.5M4.25 9.5 8 13.25l3.75-3.75" /></Svg>
)

/** Large play button used over posters: white disc, slate triangle. */
export function PlayDisc({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="32" fill="rgba(255,255,255,0.92)" />
      <path d="M26 21.5v21a1 1 0 0 0 1.52.85l17-10.5a1 1 0 0 0 0-1.7l-17-10.5A1 1 0 0 0 26 21.5Z" fill="#3F474A" />
    </svg>
  )
}
export const GridIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="2.5" width="4.25" height="4.25" rx="1" /><rect x="9.25" y="2.5" width="4.25" height="4.25" rx="1" /><rect x="2.5" y="9.25" width="4.25" height="4.25" rx="1" /><rect x="9.25" y="9.25" width="4.25" height="4.25" rx="1" /></Svg>
)
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9.5 2.5h4v4" /><path d="M13.5 2.5 7.5 8.5" /><path d="M12 9.5V13a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5V4.5a.5.5 0 0 1 .5-.5H6.5" /></Svg>
)
export const BookmarkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 2.5h8v11L8 10.75 4 13.5Z" /></Svg>
)
export const QuizIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M6.4 6.3a1.7 1.7 0 0 1 3.2.6c0 1.1-1.6 1.4-1.6 2.4" /><path d="M8 11.4v.1" /></Svg>
)
export const GripIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}><path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" /></Svg>
)
export const DuplicateIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></Svg>
)
