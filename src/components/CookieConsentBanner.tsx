'use client'

// Consent banner.
//
// It is fixed to the bottom of the viewport, which on a phone meant it
// permanently covered the primary CTA — it sat over the "Book" buttons on
// /sessions/[slug] and over the participant list on /book until dismissed.
// Two changes fix that without weakening consent:
//
//  1. A spacer of the banner's own measured height is rendered in normal
//     flow, so the page can always be scrolled clear of it. Measured
//     rather than hard-coded: the copy wraps to a different number of
//     lines at 320px vs 414px, and again at large text sizes.
//  2. The layout is compact and single-row from `sm` up, roughly halving
//     the height it occupies on mobile.

import { useState, useEffect, useRef } from 'react'
import posthog from 'posthog-js'

const CONSENT_KEY = 'empowr-members_analytics_consent'

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [height, setHeight] = useState(0)
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true)
  }, [])

  useEffect(() => {
    const node = bannerRef.current
    if (!visible || !node) {
      setHeight(0)
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height)
    })
    observer.observe(node)
    setHeight(node.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [visible])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    posthog.opt_in_capturing()
    setVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined')
    posthog.opt_out_capturing()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* Keeps the bottom of the page reachable above the fixed banner. */}
      <div aria-hidden style={{ height }} />

      <div
        ref={bannerRef}
        role="region"
        aria-label="Cookie consent"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-white shadow-md"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Stays at text-sm: this is a legal notice, and it should never
              be the smallest type on the page. The height saving comes from
              the padding and single-row layout, not from shrinking it. */}
          <p className="text-sm leading-relaxed text-mid">
            We use cookies to improve your experience and remember your
            preferences.{' '}
            <a
              href="/legal/cookie-policy"
              target="_blank"
              rel="noopener"
              className="text-blue underline underline-offset-2 hover:text-blue-dark"
            >
              Cookie Policy
            </a>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleDecline}
              className="rounded-lg border border-line px-4 py-2.5 text-sm text-mid transition-colors hover:bg-cream"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              className="rounded-lg bg-blue px-4 py-2.5 text-sm text-white transition-colors hover:bg-blue-dark"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
