'use client'

// Consent card.
//
// IT USED TO BE A FULL-WIDTH BAR across the bottom of the screen. On a laptop
// that meant a strip of chrome the entire width of a 1440px window, sitting
// over the footer and making the bottom of every page look broken until it
// was answered (owner, 2026-09-16). A consent prompt has to be seen; it does
// not have to be the widest element on the page. It is now a card in the
// bottom-left corner on desktop, and a card with side margins above the
// bottom bar on touch.
//
// WHAT DID NOT CHANGE, and must not:
//
//  1. It still clears the mobile bottom bar. `bottom-[60px]` below the
//     breakpoint keeps it off BottomNav's fixed bar — sitting ON the bar
//     would hide every mobile nav tab, the basket included, from a
//     first-time visitor until they answered a cookie prompt.
//     verify-nav-layout.ts pins that number against BOTTOM_NAV_HEIGHT_PX.
//  2. A spacer of the card's own measured height is still rendered in normal
//     flow BELOW the breakpoint, so the page can be scrolled clear of it.
//     Measured rather than hard-coded: the copy wraps to a different number
//     of lines at 320px than at 414px, and again at large text sizes.
//
//     Above the breakpoint there is NO spacer, and that is the half of this
//     change that was got wrong first time round. The spacer only ever
//     existed to clear a bar that spanned the whole width. A 352px corner
//     card covers nothing but its own corner, so reserving a full-width
//     strip under the footer left exactly that: a 148px band of empty page
//     below the footer, which the old bar used to cover and the card does
//     not. Measured at 1440x900 and reported by the owner within the hour.
//  3. Accept and Decline stay the same size and weight as each other. Making
//     "Accept" the louder button is a dark pattern and a compliance problem,
//     not a design improvement.
//
// The `lg:bottom-6` float (rather than sitting flush at `lg:bottom-0` as the
// bar did) is a deliberate change to a rule verify-nav-layout.ts pinned, and
// its assertion was updated in the same commit with the reasoning. What that
// assertion protects — clearing the touch bar below the breakpoint, and
// switching at lg like everything else — is unchanged.

import { useState, useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { BOTTOM_NAV_MEDIA_ABOVE } from '@/components/BottomNav'
import { links } from '@/lib/links'

const CONSENT_KEY = 'empowr-members_analytics_consent'

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)
  const [height, setHeight] = useState(0)
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true)
  }, [])

  // Mirrors `height` so the measurement below can subtract the spacer it
  // previously added instead of measuring its own effect.
  const spacerRef = useRef(0)
  spacerRef.current = height

  useEffect(() => {
    const node = bannerRef.current
    if (!visible || !node) {
      setHeight(0)
      return
    }

    // Only reserve space when the page actually scrolls. On a page that
    // already fits the viewport the card floats over empty space, and
    // adding a spacer there would *introduce* scrolling on a page that
    // had none — which is exactly the complaint that prompted this.
    const measure = () => {
      // Above the breakpoint the card is a corner card, not a bar. Nothing
      // spans the width, so nothing needs clearing — and reserving space
      // there is visible as a gap under the footer. Reads the SAME constant
      // BottomNav uses so the two cannot drift apart.
      if (window.matchMedia(BOTTOM_NAV_MEDIA_ABOVE).matches) {
        setHeight(0)
        return
      }

      const bannerHeight = node.getBoundingClientRect().height
      const documentHeight =
        document.documentElement.scrollHeight - spacerRef.current
      setHeight(documentHeight > window.innerHeight ? bannerHeight : 0)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
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
      {/* Keeps the bottom of the page reachable past the fixed card. */}
      <div aria-hidden style={{ height }} />

      <div
        ref={bannerRef}
        role="region"
        aria-label="Cookie consent"
        // Below lg: a card with side margins, lifted clear of the 60px bottom
        // bar. Above lg: a fixed-width card in the bottom-left corner —
        // `right-auto` is what stops it stretching, and without it the width
        // rule does nothing because `right-3` is still in force.
        className="fixed bottom-[60px] left-3 right-3 z-50 rounded-2xl border border-line bg-white p-4 shadow-md lg:bottom-6 lg:left-6 lg:right-auto lg:w-[22rem] lg:p-5"
      >
        {/* Stays at text-sm: this is a legal notice, and it should never be
            the smallest type on the page. */}
        <p className="text-sm leading-relaxed text-mid">
          We use cookies to improve your experience and remember your
          preferences.{' '}
          <a
            href={links.cookiePolicy}
            target="_blank"
            rel="noopener"
            className="text-blue underline underline-offset-2 hover:text-blue-dark"
          >
            Cookie Policy
          </a>
        </p>
        {/* Equal weight, equal size — see note 3 above. `min-h-11` keeps both
            at the 44px tap-target floor the design audit enforces. */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleDecline}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line px-4 text-sm font-bold text-mid transition-colors hover:bg-cream"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-blue px-4 text-sm font-bold text-white transition-colors hover:bg-blue-dark"
          >
            Accept
          </button>
        </div>
      </div>
    </>
  )
}
