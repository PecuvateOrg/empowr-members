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

test('SiteHeader keeps the default breakpoint', () => {
  // Three links. 58px of slack at 640px, its tightest point. Moving this to
  // `lg` would hide a working nav behind a menu button for no reason.
  assert.doesNotMatch(SITE, /breakpoint=/)
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
    assert.match(source, /className="flex min-w-0 items-center/, `${name} brand needs min-w-0`)
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
