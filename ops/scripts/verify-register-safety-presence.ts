/**
 * verify-register-safety-presence.ts
 *
 * Run:  npm run verify:register-safety-presence     (from src/)
 *
 * Structural, not behavioural. verify-register-departure.ts and
 * verify-emergency-contact-display.ts pin what the RULES answer;
 * nothing pinned that a door SEES the answer, and that gap has now
 * bitten twice.
 *
 *  1. Departure consent was collected from 2026-08-10 and read by no
 *     register in this app until 2026-09-07. The rule was correct the
 *     whole time. Nothing rendered it, and nothing failed.
 *
 *  2. The scan-a-ticket screen and the register drifted apart: the same
 *     person could be stopped at one and waved through the other.
 *
 * Both were caught by a person reading a diff. The commit that fixed
 * them claimed "every one of the four components is now asserted present
 * on both screens" — no such assertion existed. This file is that
 * assertion.
 *
 * It is deliberately crude: a substring match on source, comments
 * stripped so a component named only in prose cannot satisfy it. It
 * cannot prove the markup is correct. It can prove a refactor did not
 * quietly drop a safeguarding component off a door screen, which is the
 * failure that has actually happened.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

/** A component named in a comment is not a component that renders. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

// The register is now split across two files — the table shell and the row
// that renders one person — so "the register" means both of them together.
const REGISTER = codeOnly(
  read('components', 'admin', 'RegisterView.tsx') +
    '\n' +
    read('components', 'admin', 'RegisterBookingRow.tsx')
)
const SUBSCRIBER = codeOnly(read('components', 'admin', 'RegisterSubscriberItem.tsx'))
const SCAN = codeOnly(read('app', '(checkin)', 'checkin', '[bookingId]', 'page.tsx'))

// --- Every door screen answers the same questions --------------------------

const SCREENS: Array<[string, string]> = [
  ['the register', REGISTER],
  ['the scan-a-ticket screen', SCAN],
]

for (const [label, source] of SCREENS) {
  test(`SAFEGUARDING: ${label} renders the waiver answer`, () => {
    assert.match(source, /<WaiverBadge\b/)
  })

  test(`SAFEGUARDING: ${label} renders how the person leaves`, () => {
    assert.match(source, /<DepartureLine\b/)
  })

  test(`SAFEGUARDING: ${label} renders who to ring`, () => {
    assert.match(source, /<EmergencyContactLine\b/)
  })

  test(`${label} renders age`, () => {
    assert.match(source, /<AgeLabel\b/)
  })
}

// --- What a collapsed row may not hide -------------------------------------

test('SAFEGUARDING: the collapsed register row still shows the waiver answer', () => {
  // Not merely present in the file — present OUTSIDE the {open && ...} block.
  // Everything from the detail row onwards is behind a click.
  const row = codeOnly(read('components', 'admin', 'RegisterBookingRow.tsx'))
  const collapseStart = row.indexOf('{open && (')
  assert.ok(collapseStart > 0, 'expected a collapsible detail block to exist')
  const alwaysVisible = row.slice(0, collapseStart)
  assert.match(alwaysVisible, /<WaiverBadge\b/)
  assert.match(alwaysVisible, /<SafetyFlags\b/)
})

test('SAFEGUARDING: the collapsed subscriber row still shows the exception flags', () => {
  const collapseStart = SUBSCRIBER.indexOf('{open && (')
  assert.ok(collapseStart > 0, 'expected a collapsible detail block to exist')
  const alwaysVisible = SUBSCRIBER.slice(0, collapseStart)
  assert.match(alwaysVisible, /<SafetyFlags\b/)
  assert.match(alwaysVisible, /Waiver signed/)
})

test('SAFEGUARDING: an unknown departure is flagged, not merely collapsed', () => {
  // The rule these flags exist for. `ambiguous` means the app does not know
  // which adult may take a child — the one departure state where a door
  // acting on its own assumption is the hazard. See SafetyFlags.
  const flags = codeOnly(read('components', 'admin', 'ParticipantSafetyInfo.tsx'))
  assert.match(flags, /departure\.kind === "ambiguous"/)
  for (const kind of ['missing', 'self', 'no_phone']) {
    assert.match(
      flags,
      new RegExp(`emergencyContact\\.kind === "${kind}"`),
      `emergency contact "${kind}" must survive a collapsed row`
    )
  }
})

// --- The colSpan that cannot be checked by a compiler ----------------------

test('the detail row spans exactly the number of columns the table has', () => {
  // RegisterBookingRow's colSpan is a hand-maintained constant. A column
  // added to RegisterView and not to it leaves the open detail visibly
  // short, and neither tsc nor next build says a word.
  const view = codeOnly(read('components', 'admin', 'RegisterView.tsx'))
  const headerCells = [...view.matchAll(/<th\b/g)].length
  const row = read('components', 'admin', 'RegisterBookingRow.tsx')
  const declared = row.match(/const COLUMN_COUNT = (\d+)/)
  assert.ok(declared, 'RegisterBookingRow must declare COLUMN_COUNT')
  assert.equal(
    Number(declared[1]),
    headerCells,
    `RegisterView has ${headerCells} <th> cells; RegisterBookingRow spans ${declared[1]}`
  )
})

test('the register table renders one row component per booking, not inline cells', () => {
  // The point of the split: the row markup exists once. An inline <tr> here
  // would be a second copy of the check-in gate.
  const view = codeOnly(read('components', 'admin', 'RegisterView.tsx'))
  assert.match(view, /<RegisterBookingRow\b/)
  assert.doesNotMatch(view.split('<tbody')[1] ?? '', /<td\b/)
})

// --- Medical notes, now that they are behind a click ----------------------

test('SAFEGUARDING: a medical note raises a flag on the surface', () => {
  // The note moved into the expander because free text a parent wrote is the
  // widest thing on the row. Unlike a departure arrangement there is no
  // conservative default a door falls back on if it never opens the row, so
  // the EXISTENCE of a note has to be visible while the row is shut.
  const flags = codeOnly(read('components', 'admin', 'ParticipantSafetyInfo.tsx'))
  assert.match(flags, /medicalNotes && medicalNotes\.trim\(\)/)
  assert.match(flags, /flags\.push\("Medical notes"\)/)
})

test('SAFEGUARDING: both lists actually PASS the note to SafetyFlags', () => {
  // The failure this pins is silent and total: a caller that renders
  // <SafetyFlags> without medicalNotes gets no badge, no error and no visible
  // difference on a row whose note is now hidden. The note would simply stop
  // existing as far as a door is concerned.
  for (const file of ['RegisterBookingRow.tsx', 'RegisterSubscriberItem.tsx']) {
    const source = codeOnly(read('components', 'admin', file))
    const call = source.match(/<SafetyFlags[\s\S]*?\/>/)
    assert.ok(call, `${file} must render SafetyFlags`)
    assert.match(call[0], /medicalNotes=\{/, `${file} renders SafetyFlags without passing medicalNotes`)
  }
})

test('SAFEGUARDING: the note itself is rendered inside both expanders', () => {
  // A flag with nothing behind it is worse than no flag: it tells a door a
  // note exists and then refuses to say what it is.
  for (const file of ['RegisterBookingRow.tsx', 'RegisterSubscriberItem.tsx']) {
    const source = codeOnly(read('components', 'admin', file))
    const collapseStart = source.indexOf('{open && (')
    assert.ok(collapseStart > 0, `${file} needs a collapsible block`)
    assert.match(
      source.slice(collapseStart),
      /<MedicalNotesBlock\b/,
      `${file} flags a note but never renders it`
    )
  }
})

test('the scan-a-ticket screen still shows the note outright', () => {
  // One person per screen, no width problem, no reason to collapse it. The
  // register and the scan screen may present the note differently; neither
  // may omit it.
  assert.match(SCAN, /medicalNotes/)
})
