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

import { useEffect, useState } from "react";
import { ShoppingBasket, X } from "lucide-react";

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
    <div role="region" aria-label="What's new" className="border-b border-line bg-blue-pale">
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
