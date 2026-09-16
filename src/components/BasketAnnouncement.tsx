"use client";

// "You can now book several sessions at once" — the notice that tells
// members the basket exists.
//
// TWO THINGS RETIRE IT, and both matter. A member dismisses it (per browser,
// per device — localStorage, the same mechanism CookieConsentBanner uses),
// and it stops rendering for EVERYONE after RETIRE_AFTER regardless. An
// announcement with no end date stops being an announcement and becomes
// furniture: people who have used the basket for a month still see it
// introduced to them.
//
// AFTER THE DATE BELOW PASSES this component renders null and the whole
// file — plus its line in SiteHeader — is safe to delete. That is the
// intended end state, not an oversight. Agreed with Empowr 2026-09-15 as
// "about four weeks".
//
// IT STICKS, as of 2026-09-16 (owner: "keep the note sticky also so it is
// always seen until dismissed"). It previously scrolled away with the page,
// which on a phone meant it was gone after one flick and a member who had
// not read it never would.
//
// WHY THE OFFSET IS MEASURED RATHER THAN A CLASS. This notice is a SIBLING of
// <header>, not a child — SiteHeader's own comment explains why, and that has
// not changed. Above `lg` the header is itself sticky at top:0, so pinning
// this at top:0 too would park it UNDERNEATH the header (the header is z-40,
// this is z-30) where it is never seen again. It has to pin directly below
// the header, which means knowing the header's height.
//
// The obvious alternative — wrapping header and notice in one sticky div —
// does not work, and the reason is the trap SiteHeader already records: a
// sticky element can only travel within its PARENT's box. Wrapped, this
// notice could move within the wrapper and nowhere else. Below `lg` it would
// stop sticking entirely; and a wrapper sticky at every width would pin the
// wordmark bar too, spending ~136px of a phone screen on chrome that
// BottomNav already carries at the other end.
//
// So: below `lg` the header does not stick, this pins at 0. Above `lg` it
// pins at exactly the header's height, re-measured whenever that changes.

import { useEffect, useRef, useState } from "react";
import { ShoppingBasket, X } from "lucide-react";
import { BOTTOM_NAV_MEDIA_ABOVE } from "@/components/BottomNav";

const DISMISS_KEY = "empowr-members_basket_announcement_dismissed";

/** Four weeks from the basket going live. Deliberately a hard date, not a
 *  duration from first view: the point is that the feature stops being new
 *  on a fixed day, not four weeks after each person happens to show up. */
const RETIRE_AFTER = new Date("2026-10-13T00:00:00Z");

export function BasketAnnouncement() {
  // Starts hidden and is only turned on after the localStorage read. The
  // server renders nothing, so there is no flash of a notice that the
  // member already dismissed.
  const [visible, setVisible] = useState(false);
  const [stickyTop, setStickyTop] = useState(0);
  const selfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Date.now() >= RETIRE_AFTER.getTime()) return;
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      // Private mode or blocked storage: show it. An undismissable notice
      // is a smaller failure than a broken header.
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;

    // The header this sits under. Queried rather than passed down because
    // SiteHeader is a server component and this is the only client in the
    // pair — threading a ref through would force the header into the client
    // bundle to solve a purely visual offset.
    const header = selfRef.current?.previousElementSibling ?? null;

    const sync = () => {
      // Reads the SAME breakpoint constant BottomNav and the consent card
      // use, so all three cannot drift apart.
      const aboveBreakpoint = window.matchMedia(BOTTOM_NAV_MEDIA_ABOVE).matches;
      setStickyTop(
        aboveBreakpoint && header
          ? Math.round(header.getBoundingClientRect().height)
          : 0
      );
    };

    sync();
    // The header's height is not fixed: the wordmark can wrap, and a browser
    // zoom or a large-text setting changes it. Observing it means the offset
    // follows rather than being a number that was right once.
    const observer = header ? new ResizeObserver(sync) : null;
    if (header) observer!.observe(header);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [visible]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to persist to — hiding it for this page view is still the
      // right response to the member clicking the X.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    // z-30 sits BELOW the header's z-40 (they never overlap — this pins
    // directly beneath it) and below the consent card's z-50 and the bottom
    // bar's z-60, both of which are answers a member is being asked for and
    // outrank an announcement.
    <div
      ref={selfRef}
      role="region"
      aria-label="What's new"
      className="sticky z-30 border-b border-line bg-blue-pale"
      style={{ top: stickyTop }}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <ShoppingBasket className="h-5 w-5 shrink-0 text-blue" aria-hidden />
        <p className="flex-1 text-sm font-semibold text-blue-dark">
          <span className="font-black">New:</span> you can now add several
          sessions to a basket and pay for them all in one go.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-dark transition-colors hover:text-blue"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
