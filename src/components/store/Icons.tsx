/**
 * Icon set.
 *
 * These are the exact SVGs the reference theme (Dawn 15.3.0) ships, kept at
 * their original viewBoxes and stroke weights so header and card icons sit on
 * the same optical grid as the original.
 */

type IconProps = { className?: string }

export function IconSearch({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 18 19"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.03 11.68A5.784 5.784 0 112.85 3.5a5.784 5.784 0 018.18 8.18zm.26 1.12a6.78 6.78 0 11.72-.7l5.4 5.4a.5.5 0 11-.71.7l-5.41-5.4z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconClose({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 18 17"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M.865 15.978a.5.5 0 00.707.707l7.433-7.431 7.579 7.282a.501.501 0 00.846-.37.5.5 0 00-.153-.351L9.712 8.546l7.417-7.416a.5.5 0 10-.707-.708L8.991 7.853 1.413.573a.5.5 0 10-.693.72l7.563 7.268-7.418 7.417z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconAccount({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 18 19"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 4.5a3 3 0 116 0 3 3 0 01-6 0zm3-4a4 4 0 100 8 4 4 0 000-8zm5.58 12.15c1.12.82 1.83 2.24 1.91 4.85H1.51c.08-2.6.79-4.03 1.9-4.85C4.66 11.75 6.5 11.5 9 11.5s4.35.26 5.58 1.15zM9 10.5c-2.5 0-4.65.24-6.17 1.35C1.27 12.98.5 14.93.5 18v.5h17V18c0-3.07-.77-5.02-2.33-6.15-1.52-1.1-3.67-1.35-6.17-1.35z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconCart({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15.75 11.8h-3.16l-.77 11.6a5 5 0 004.99 5.34h7.38a5 5 0 004.99-5.33L28.4 11.8h-3.15m-9.5 0v-.75a4.75 4.75 0 119.5 0v.75m-9.5 0h9.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

export function IconHamburger({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 18 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1 3.5h16M1 8h16M1 12.5h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconCaret({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 6"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.354.646a.5.5 0 00-.708 0L5 4.293 1.354.646a.5.5 0 00-.708.708l4 4a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconArrow({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.537.808a.5.5 0 01.817-.162l4 4a.5.5 0 010 .708l-4 4a.5.5 0 11-.708-.708L11.793 5.5H1a.5.5 0 010-1h10.793L8.646 1.354a.5.5 0 01-.109-.546z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconInstagram({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M10.001 7.4a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2zM10 5.4a4.6 4.6 0 110 9.2 4.6 4.6 0 010-9.2z"
      />
      <circle cx="15.2" cy="4.8" r="1.1" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6.4 0h7.2A6.4 6.4 0 0120 6.4v7.2a6.4 6.4 0 01-6.4 6.4H6.4A6.4 6.4 0 010 13.6V6.4A6.4 6.4 0 016.4 0zm0 2A4.4 4.4 0 002 6.4v7.2A4.4 4.4 0 006.4 18h7.2a4.4 4.4 0 004.4-4.4V6.4A4.4 4.4 0 0013.6 2H6.4z"
      />
    </svg>
  )
}

export function IconMinus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 10 2" aria-hidden="true" focusable="false">
      <path d="M.5 1h9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path
        d="M5 .5v9M.5 5h9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconRemove({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M14 3H2m4.5 0V1.5h3V3m-6 0l.5 10.5a1.5 1.5 0 001.5 1.4h5a1.5 1.5 0 001.5-1.4L13 3"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
