/**
 * verify-register-departure.ts
 *
 * Run:  npm run verify:register-departure     (from src/)
 *
 * Covers lib/register-departure.ts — what the door is told about how a child
 * leaves — and localDateOf(), which decides WHICH day's consents are even
 * looked at.
 *
 * THE CASE THIS SUITE EXISTS FOR is `collected_in_person` when the child has a
 * standing default travel method. `mem_participants.default_travel_method` is
 * what a parent USUALLY does, and defaultConsentState() pre-ticks the booking
 * form from it — so a parent who has a default and submitted no consent has
 * actively turned it off for this session. A resolver that "helpfully" fell
 * back to the default would tell staff a child may walk home alone on exactly
 * the occasion the parent declined to authorise it. That is a safeguarding
 * failure, not a display bug, so it is asserted from both directions here.
 *
 * The other load-bearing case is `ambiguous`. departure_consents.person_id is
 * the SIGNER's id and siblings share it, so the child is identified by free
 * text — against this project's own rule never to bind entities by name. Where
 * the name cannot disambiguate, the door must be told to check rather than
 * shown a guess.
 *
 * Fixtures mirror the live shape observed 2026-09-07: one real consent
 * (Aurora Pearson, 2026-09-09, collected_by_other) written by the standalone
 * waiver app against a parent's people.id.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDeparture,
  travelMethodLabel,
  type DepartureConsentRecord,
  type DepartureParticipant,
} from '../../src/lib/register-departure.ts'
import { localDateOf } from '../../src/lib/slot-matching.ts'

const PARENT = 'person-parent-1'
const OTHER_PARENT = 'person-parent-2'

/** Born 2015 — a minor for the lifetime of this suite. */
function child(overrides: Partial<DepartureParticipant> = {}): DepartureParticipant {
  return {
    name: 'Aurora Pearson',
    dob: '2015-11-06',
    personId: PARENT,
    defaultTravelMethod: null,
    ...overrides,
  }
}

function consent(
  overrides: Partial<DepartureConsentRecord> = {}
): DepartureConsentRecord {
  return {
    personId: PARENT,
    childName: 'Aurora Pearson',
    travelMethod: 'collected_by_other',
    travelMethodOther: null,
    ...overrides,
  }
}

test('an adult gets no departure line at all', () => {
  assert.deepEqual(
    resolveDeparture(child({ dob: '1973-11-01' }), [consent()]),
    { kind: 'not_applicable' }
  )
})

test('no DOB on file is not treated as a child', () => {
  // Every booking path requires a DOB, so null is a legacy/imported row.
  assert.deepEqual(resolveDeparture(child({ dob: null }), [consent()]), {
    kind: 'not_applicable',
  })
})

test('a consent for this session is reported as authorised', () => {
  assert.deepEqual(resolveDeparture(child(), [consent()]), {
    kind: 'authorised',
    label: 'Collected by someone else (not the usual contact)',
  })
})

test('"other" uses the parent free text, not the word "other"', () => {
  assert.deepEqual(
    resolveDeparture(child(), [
      consent({ travelMethod: 'other', travelMethodOther: 'Goes with the Khan family' }),
    ]),
    { kind: 'authorised', label: 'Goes with the Khan family' }
  )
})

test('SAFEGUARDING: a standing default is NOT an authorisation', () => {
  // The parent walks home alone every week, but submitted no consent for this
  // one. The door must be told to hold the child.
  const status = resolveDeparture(
    child({ defaultTravelMethod: 'walk_alone' }),
    []
  )
  assert.equal(status.kind, 'collected_in_person')
  assert.notEqual(
    status.kind,
    'authorised',
    'a standing default must never resolve to authorised'
  )
})

test('SAFEGUARDING: the default is shown only as labelled context', () => {
  assert.deepEqual(
    resolveDeparture(child({ defaultTravelMethod: 'public_transport' }), []),
    { kind: 'collected_in_person', usually: 'Public transport' }
  )
})

test('a minor with nothing on file is collected in person', () => {
  assert.deepEqual(resolveDeparture(child(), []), {
    kind: 'collected_in_person',
    usually: null,
  })
})

test('another parent\'s consent for a same-named child does NOT match', () => {
  // person_id scoping is what stops one family's authorisation leaking onto
  // another family's child.
  assert.equal(
    resolveDeparture(child(), [consent({ personId: OTHER_PARENT })]).kind,
    'collected_in_person'
  )
})

test('siblings under one signer each get their own answer', () => {
  const consents = [
    consent({ childName: 'Aurora Pearson', travelMethod: 'walk_alone' }),
    consent({ childName: 'Rafe Pearson', travelMethod: 'with_sibling' }),
  ]
  assert.deepEqual(resolveDeparture(child({ name: 'Aurora Pearson' }), consents), {
    kind: 'authorised',
    label: 'Walks home alone',
  })
  assert.deepEqual(resolveDeparture(child({ name: 'Rafe Pearson' }), consents), {
    kind: 'authorised',
    label: 'Leaving with a sibling',
  })
})

test('name matching ignores case and surrounding whitespace', () => {
  assert.equal(
    resolveDeparture(child({ name: 'Aurora Pearson' }), [
      consent({ childName: '  aurora pearson ' }),
    ]).kind,
    'authorised'
  )
})

test('TWO consents for the same name REFUSE to guess', () => {
  const status = resolveDeparture(child(), [
    consent({ travelMethod: 'walk_alone' }),
    consent({ travelMethod: 'collected_by_other' }),
  ])
  assert.deepEqual(status, { kind: 'ambiguous' })
})

test('a participant with no person_id cannot match a consent', () => {
  assert.equal(
    resolveDeparture(child({ personId: null }), [consent()]).kind,
    'collected_in_person'
  )
})

test('an unrecognised travel method is shown, never blanked', () => {
  // Blanking it at a door would hide a real departure arrangement.
  assert.equal(travelMethodLabel('taxi_with_gran', null), 'taxi_with_gran')
})

// --- localDateOf: which day's consents get read at all ---

test('a late session keeps its UK date under BST', () => {
  // 20:30 UK on 14 Sep is 19:30Z — same calendar day either way.
  assert.equal(localDateOf('2026-09-14T19:30:00Z'), '2026-09-14')
})

test('a late session does not roll into the next UK day', () => {
  // 23:30 UK on 14 Sep during BST is 22:30Z. Reading the UTC date would
  // still give the 14th here, so the sharper case is the one below.
  assert.equal(localDateOf('2026-09-14T22:30:00Z'), '2026-09-14')
})

test('an instant already past midnight UTC is still the UK evening', () => {
  // 00:30Z on 15 Sep is 01:30 UK — genuinely the 15th. Pinning the
  // conversion in both directions so a naive .slice(0,10) cannot pass.
  assert.equal(localDateOf('2026-09-15T00:30:00Z'), '2026-09-15')
  // And in winter, 00:30Z IS 00:30 UK.
  assert.equal(localDateOf('2026-12-15T00:30:00Z'), '2026-12-15')
})

test('the UK date is not the UTC date for a BST midnight-adjacent session', () => {
  // 23:30 UK on 30 June = 22:30Z. A register built from the UTC date would
  // look for consents on the same day here, but this pins the general rule:
  // the formatter is asked for Europe/London, never for UTC.
  assert.equal(localDateOf('2026-06-30T22:30:00Z'), '2026-06-30')
  // 23:30Z on 30 June is 00:30 UK on 1 JULY — the case that breaks a naive
  // implementation, and the one a late Skate Jam actually lands on.
  assert.equal(localDateOf('2026-06-30T23:30:00Z'), '2026-07-01')
})
