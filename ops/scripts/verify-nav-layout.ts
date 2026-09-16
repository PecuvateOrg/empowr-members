/**
 * verify-nav-layout.ts
 *
 * Run:  npm run verify:nav-layout     (from src/)
 *
 * Pins the header layout rules that no compiler can see and no unit test
 * would think to ask about.
 *
 * THE BUG THIS EXISTS FOR. CollapsibleNav hardcoded `sm` (640px) as the width
 * where the menu button becomes a full inline row, and used it for both
 * headers. AdminHeader needs 746px to lay its row out and had 577px at 640px.
 * It did not wrap, scroll the nav, or throw: `justify-between` shrank the
 * brand as a flex item while `whitespace-nowrap` kept its TEXT at full width,
 * so from 640px to 833px "Members Admin" was painted on top of "Check in", and
 * below 768px the page grew a horizontal scrollbar with "Sign out" off the
 * right-hand edge. At 768px — an iPad in portrait, which is what a door
 * actually holds — there was no page overflow at all. Two strings simply
 * occupied the same pixels. Nothing in the build, the types, or the
 * design-audit harness said a word, and the harness could not have: both
 * headers that carry a nav are behind an auth gate it cannot pass.
 *
 * These are structural assertions on source text. They cannot prove the header
 * fits — that was measured in a browser against the built app on 2026-09-08.
 * They pin the three things that would silently undo the measurement.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

const NAV = codeOnly(read('components', 'CollapsibleNav.tsx'))
const ADMIN = codeOnly(read('components', 'AdminHeader.tsx'))
const SITE = codeOnly(read('components', 'SiteHeader.tsx'))
const BOTTOM = codeOnly(read('components', 'BottomNav.tsx'))
const COOKIE = codeOnly(read('components', 'CookieConsentBanner.tsx'))
const ROOT = codeOnly(read('app', 'layout.tsx'))
const BASKET = codeOnly(read('components', 'booking', 'BasketNavLink.tsx'))
const FOOTER = codeOnly(read('components', 'Footer.tsx'))

// --- Breakpoint classes must be literals -----------------------------------

test('every breakpoint class is written out in full, never interpolated', () => {
  // Tailwind resolves classes by scanning source text. `${breakpoint}:flex`
  // type-checks, builds, ships, and emits NO CSS — the inline nav would just
  // never appear, at any width, with nothing to grep for.
  for (const literal of ['"sm:flex"', '"sm:hidden"', '"lg:flex"', '"lg:hidden"']) {
    assert.ok(NAV.includes(literal), `CollapsibleNav must contain the literal ${literal}`)
  }
  assert.doesNotMatch(
    NAV,
    /\$\{[^}]*\}:(flex|hidden|inline)/,
    'a breakpoint class is being interpolated — Tailwind will emit nothing for it'
  )
})

test('the burger, the panel and the inline row switch at the SAME width', () => {
  // Three classes, one decision. If the nav flipped at `lg` but the burger
  // still hid at `sm`, 640-1023px would show neither control and the header
  // would have no navigation at all.
  const entries = [...NAV.matchAll(/(\w+): \{ inline: "(\w+):flex", collapsed: "(\w+):hidden" \}/g)]
  assert.ok(entries.length >= 2, 'expected a breakpoint map with at least two entries')
  for (const [, key, inlineBp, collapsedBp] of entries) {
    assert.equal(inlineBp, key, `breakpoint "${key}" maps to an inline class for "${inlineBp}"`)
    assert.equal(collapsedBp, key, `breakpoint "${key}" maps to a collapsed class for "${collapsedBp}"`)
  }
})

test('nothing outside the breakpoint map hardcodes a responsive nav class', () => {
  // The three className strings must read their breakpoint from the map. A
  // stray `sm:hidden` left on the panel is how the burger and the panel drift
  // apart, and it is invisible until someone resizes a window.
  const withoutMap = NAV.replace(/const BREAKPOINTS = \{[\s\S]*?\} as const;/, '')
  assert.doesNotMatch(
    withoutMap,
    /"[^"]*\b(sm|md|lg|xl):(flex|hidden)\b/,
    'a responsive nav class is hardcoded outside the BREAKPOINTS map'
  )
})

// --- Each header takes the breakpoint its own content needs ----------------

test('AdminHeader collapses at lg, not at the default', () => {
  // Six links, a Sign out and a wordmark. Measured 2026-09-08: it first has
  // room at 834px, and that is 25px of margin — renaming one link would put
  // it back on top of itself — so it holds the stacked menu until 1024px.
  assert.match(ADMIN, /breakpoint="lg"/)
})

test('SiteHeader collapses at lg, matching the touch bar', () => {
  // Was the default `sm`. Raised to `lg` on 2026-09-15 so the bottom bar
  // covers tablets, not just phones: a 768px iPad in portrait now gets the
  // touch nav, which is the same reasoning that put AdminHeader on `lg` for
  // the door tablet. The two nav-carrying headers finally agree on where
  // touch ends instead of each having its own idea.
  assert.match(SITE, /breakpoint="lg"/)
})

test('a header that grew past six links has to be re-measured', () => {
  // Not a style rule. `lg` was chosen from a measurement of THIS link list;
  // adding to it invalidates that measurement, and the failure mode is
  // silent overlap rather than anything that looks like a bug.
  const labels = [...ADMIN.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1])
  assert.ok(
    labels.length <= 6,
    `AdminHeader now has ${labels.length} links (${labels.join(', ')}). The lg breakpoint ` +
      `was measured against 6. Re-measure the header width before raising this bound.`
  )
})

// --- The safety net, for the link nobody has added yet ---------------------

test('both wordmarks degrade to an ellipsis rather than overlapping the nav', () => {
  // Verified in a browser: with 9 admin links at 1024px the old markup
  // overlaps the nav by 12px in silence; with these three classes it
  // ellipsises with zero overlap. All three are load-bearing — `truncate`
  // alone does nothing while the flex item refuses to shrink below its
  // content, which is a flex default and needs min-w-0 to defeat.
  for (const [name, source] of [['AdminHeader', ADMIN], ['SiteHeader', SITE]] as const) {
    // `min-w-0` is the load-bearing class — a flex item refuses to shrink
    // below its content without it, which is what printed the wordmark over
    // the nav. The vertical alignment beside it is a design choice and is
    // deliberately NOT pinned: SiteHeader uses `items-end` to sit "Members"
    // on the same line as the logo's own "Empowr".
    assert.match(source, /className="flex min-w-0 items-\w+/, `${name} brand needs min-w-0`)
    assert.match(source, /<span className="truncate /, `${name} wordmark needs truncate`)
    assert.match(source, /w-\[44px\] shrink-0/, `${name} logo must not shrink`)
    assert.doesNotMatch(
      source,
      /tracking-tight whitespace-nowrap/,
      `${name} wordmark still has whitespace-nowrap without overflow handling — ` +
        `that combination is what printed the wordmark over the nav`
    )
  }
})

// --- The mobile bottom bar (added 2026-09-15) -----------------------------

test('the bar height, its spacer and the cookie offset are ONE number', () => {
  // Three places have to agree or something ends up unreachable at the
  // bottom of a phone: the fixed bar's own height, the spacer that lets the
  // page scroll clear of it, and the offset that lifts the cookie banner
  // above it. The first two share the exported constant; the third is a
  // Tailwind class and cannot, so it is pinned here instead.
  const height = BOTTOM.match(/BOTTOM_NAV_HEIGHT_PX = (\d+)/)
  assert.ok(height, 'BottomNav must export BOTTOM_NAV_HEIGHT_PX as a literal')
  assert.match(
    COOKIE,
    // `\\[` not `\[` — in a template literal `\[` is just `[`, which turned
    // this into the CHARACTER CLASS [60px] and matched `sm:bottom-0` on
    // every run. The test passed against a deliberately drifted value until
    // that was tripped on purpose.
    new RegExp(`bottom-\\[${height[1]}px\\]`),
    `CookieConsentBanner must clear the ${height[1]}px bar. Sitting on it hides every ` +
      'mobile nav tab - the basket included - until a first-time visitor answers ' +
      'the cookie prompt.'
  )
  // `lg:bottom-6`, not `lg:bottom-0`, since 2026-09-16: above the breakpoint
  // the prompt is a card in the bottom-LEFT corner rather than a bar across
  // the whole width, so it floats clear of the edge instead of sitting on it.
  // What this assertion protects is unchanged — that the rule switches at lg
  // like every other one, and that below lg it still clears the touch bar,
  // which the `bottom-[60px]` check above pins.
  assert.match(COOKIE, /lg:bottom-6/, 'above the breakpoint the card floats clear of the edge')
})

test('the spacer is rendered AFTER the footer, last in the body', () => {
  // Found in a browser, not by reading: with the spacer inside
  // (member)/layout.tsx it sat ABOVE <Footer />, which the root layout
  // renders after {children} - so the footer stayed under the fixed bar once
  // the cookie banner was accepted and stopped contributing its own spacer.
  const footer = ROOT.indexOf('<Footer />')
  const spacer = ROOT.indexOf('<BottomNavSpacer />')
  assert.ok(footer !== -1 && spacer !== -1, 'root layout renders both')
  assert.ok(spacer > footer, 'BottomNavSpacer must come after <Footer />')
})

test('the bar and its spacer share one surface rule', () => {
  // If the bar renders and the spacer does not, the footer is unreachable.
  // If the spacer renders and the bar does not, an admin page grows 60px of
  // dead space. Both read the same hook.
  // CALL SITES only. The loose form counted the hook's own declaration
  // (`function useOnMemberSurface(): boolean`) as one of the two, so it
  // still read green with the spacer's guard deleted.
  const uses = [...BOTTOM.matchAll(/const \w+ = useOnMemberSurface\(\)/g)]
  assert.equal(
    uses.length,
    2,
    'BottomNav and BottomNavSpacer must BOTH gate on useOnMemberSurface() - ' +
      'if only one does, either the footer is unreachable or an admin page ' +
      'grows dead space at the bottom'
  )
})

test('the bar covers every route that renders SiteHeader, and only those', () => {
  // Derived from the folders on disk, never hand-listed - the sibling
  // failure to this one is a list that silently falls behind the routes.
  //
  // The bar is a POSITIVE prefix list. An earlier version excluded /admin
  // and /checkin and let everything else through, which put a nav bar on
  // /login, /signup, /auth/confirm, the home page and /ticket/[bookingId] -
  // the QR code a member holds up at the door, which has no header by
  // design. This test is why that cannot come back.
  // Scoped to the BAR_PREFIXES array. The loose form also matched the TABS
  // array's own `href: "/bookings"` and reported it as a duplicate prefix.
  const block = BOTTOM.match(/const BAR_PREFIXES = \[([\s\S]*?)\]/)
  assert.ok(block, 'BottomNav must declare BAR_PREFIXES as a literal array')
  const listed = [...block[1].matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]).sort()

  const memberDir = path.join(srcDir, 'app', '(member)')
  const fromDisk = fs
    .readdirSync(memberDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        // `[param]` is a dynamic segment of a parent route, and `_name` is a
        // Next.js PRIVATE folder - opted out of routing entirely, so it is
        // not a surface and must not demand a prefix.
        !entry.name.startsWith('[') &&
        !entry.name.startsWith('_')
    )
    .map((entry) => `/${entry.name}`)
  // The public catalogue renders SiteHeader from its own layout.
  const expected = [...new Set([...fromDisk, '/sessions'])].sort()

  assert.deepEqual(
    listed,
    expected,
    `BottomNav's prefixes have drifted from the routes that render SiteHeader.\n` +
      `  on disk: ${expected.join(', ')}\n  in code: ${listed.join(', ')}`
  )

  for (const never of ['/login', '/signup', '/ticket', '/admin', '/checkin']) {
    assert.ok(
      !listed.includes(never),
      `${never} has no SiteHeader and must never carry the bottom bar`
    )
  }
})

test('only ONE menu trigger exists on a mobile member page', () => {
  // The bottom bar owns the collapsed menu. If SiteHeader also rendered its
  // hamburger there would be two triggers, two panels and two aria-controls
  // targets on the same screen.
  // Anchored to the ELEMENT, not the bare string. `codeOnly` strips `//`
  // lines but not JSX `{/* ... */}` blocks, and SiteHeader's own comment
  // explains showTrigger={false} in prose — so the loose form of this test
  // matched the comment and passed with the prop deleted from the code.
  assert.match(
    SITE,
    /<CollapsibleNav[^>]*showTrigger=\{false\}/,
    'SiteHeader must pass showTrigger={false} - BottomNav owns the mobile menu'
  )
})

test('the bottom bar carries exactly three slots', () => {
  // Menu, Account, Basket (owner, 2026-09-15, revising an earlier five).
  // Home, Sessions and Bookings are destinations you choose and moved into
  // the Menu panel; the basket is a transaction in progress and the account
  // is the one place a member returns to. Three wide targets also beat five
  // narrow ones on a 320px screen.
  //
  // Counted from the MARKUP, not from a list: two of the three slots are
  // written out as elements (the menu button and the Account link) and the
  // third is <BasketTabIcon />, so there is no array to count. An earlier
  // version counted a TABS array and silently measured nothing once that
  // array was removed.
  const bar = BOTTOM.match(/<nav\s+aria-label="Main"[\s\S]*?<\/nav>/)
  assert.ok(bar, 'BottomNav must render a <nav aria-label="Main">')
  const slots = [
    ...bar[0].matchAll(/<(button|Link|BasketTabIcon)\b/g),
  ].map((m) => m[1])
  assert.deepEqual(
    slots,
    ['button', 'Link', 'BasketTabIcon'],
    `the bar must be exactly Menu, Account, Basket - found ${slots.join(', ')}`
  )
})

test('every breakpoint-dependent rule agrees on lg', () => {
  // SIX places have to switch at the same width or the UI tears in the
  // middle: the bar, its spacer, the header's inline row, the header basket
  // icon, the cookie banner offset, and the media query that closes an open
  // panel. A mismatch is invisible until someone resizes to the gap between
  // the two values - which is most of a tablet.
  assert.match(BOTTOM, /lg:hidden/, 'the bar must hide at lg')
  assert.equal(
    (BOTTOM.match(/lg:hidden/g) ?? []).length,
    2,
    'both the bar and BottomNavSpacer must carry lg:hidden'
  )
  assert.match(
    BOTTOM,
    /BOTTOM_NAV_MEDIA_ABOVE = "\(min-width: 64rem\)"/,
    'the close-above media query must be 64rem, which is lg'
  )
  assert.match(SITE, /breakpoint="lg"/, "the header's inline row must appear at lg")
  assert.match(BASKET, /lg:flex/, 'the header basket icon must appear at lg')
  assert.match(COOKIE, /lg:bottom-6/, 'the cookie card must switch to its desktop offset at lg')
  assert.match(FOOTER, /lg:block/, 'the footer must step aside below lg where the bar carries its content')

  for (const [name, source] of [
    ['BottomNav', BOTTOM],
    ['SiteHeader', SITE],
    ['CookieConsentBanner', COOKIE],
    ['Footer', FOOTER],
  ] as const) {
    assert.doesNotMatch(
      source,
      // The lookahead matters: `\b` alone also matched `sm:flex-row`, which
      // is an internal layout rule (how the cookie banner and the footer
      // stack their own children) and has nothing to do with where nav
      // switches. Only the bare visibility/position utilities are nav rules.
      /\bsm:(hidden|flex|bottom-0)(?![-\w])/,
      `${name} still switches a nav rule at sm - the breakpoint moved to lg`
    )
  }
})
