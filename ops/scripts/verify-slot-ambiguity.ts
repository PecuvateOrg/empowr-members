/**
 * verify-slot-ambiguity.ts
 *
 * Run:  npm run verify:slot-ambiguity     (from src/)
 *   or: node --test ops/scripts/verify-slot-ambiguity.ts
 *
 * Covers lib/slot-ambiguity.ts — the detector for a plan whose "every slot of
 * this offering" entitlement has stopped matching the single weekly session
 * its NAME promises.
 *
 * THE CASE THAT MATTERS is the TRIPPING one, not the clean one. On 2026-09-07
 * the live data was clean: three of five plans carried a NULL slot and all
 * three were correct, because each offering ran exactly one weekly session. A
 * suite that only fed it that state would pass for the same reason the bug was
 * invisible for weeks — see [[feedback_stochastic_gate_needs_tripping_input]].
 * So every assertion below that proves the detector WORKS feeds it an offering
 * with two slots.
 *
 * Fixtures mirror the real catalogue observed live on 2026-09-07:
 *   SYNKRON8: Roller Dance for Beginners — Mondays 20:30 only (NULL slot, OK)
 *   Sk8 Skool for Kidz — Mondays 16:00 AND Wednesdays 17:00 (explicit slots)
 * The tripping fixture is SYNKRON8 with a second night added, which is exactly
 * the change this exists to catch.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findSlotAmbiguities,
  type WildcardEntitlement,
} from '../../src/lib/slot-ambiguity.ts'

const SYNKRON8 = 'off_synkron8'
const KIDZ = 'off_kidz'

function wildcard(overrides: Partial<WildcardEntitlement> = {}): WildcardEntitlement {
  return {
    planId: 'plan_synkron8',
    planName: 'SYNKRON8 — Mondays',
    offeringId: SYNKRON8,
    offeringTitle: 'SYNKRON8: Roller Dance for Beginners',
    activeSubscribers: 1,
    ...overrides,
  }
}

/** Mondays 20:30 UK local. September is BST (UTC+1), so 19:30Z. */
const MONDAY_2030_BST = { offering_id: SYNKRON8, starts_at: '2026-09-14T19:30:00Z' }
/** The SAME weekly slot in GMT — 20:30Z. If this module ever compared UTC,
 *  these two would look like different slots and every offering would be
 *  reported as ambiguous each autumn. */
const MONDAY_2030_GMT = { offering_id: SYNKRON8, starts_at: '2026-11-16T20:30:00Z' }
/** A genuinely different night — the change this detector exists to catch. */
const THURSDAY_1900_BST = { offering_id: SYNKRON8, starts_at: '2026-09-17T18:00:00Z' }

test('CLEAN: one weekly slot is not ambiguous', () => {
  assert.deepEqual(
    findSlotAmbiguities([wildcard()], [MONDAY_2030_BST, MONDAY_2030_GMT]),
    []
  )
})

test('the BST/GMT boundary is NOT a second slot', () => {
  // Explicit restatement of the assertion above, because this is the failure
  // that would make the alert cry wolf every October until someone muted it.
  const findings = findSlotAmbiguities([wildcard()], [
    MONDAY_2030_BST,
    MONDAY_2030_GMT,
    { offering_id: SYNKRON8, starts_at: '2026-12-14T20:30:00Z' },
  ])
  assert.equal(findings.length, 0)
})

test('TRIPS when the offering gains a second night', () => {
  const findings = findSlotAmbiguities([wildcard()], [
    MONDAY_2030_BST,
    MONDAY_2030_GMT,
    THURSDAY_1900_BST,
  ])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].planName, 'SYNKRON8 — Mondays')
  assert.equal(findings[0].activeSubscribers, 1)
  assert.deepEqual(findings[0].slots, ['Mondays 8:30pm', 'Thursdays 7pm'])
})

test('TRIPS with no subscribers yet — the plan is still on sale', () => {
  const findings = findSlotAmbiguities(
    [wildcard({ activeSubscribers: 0 })],
    [MONDAY_2030_BST, THURSDAY_1900_BST]
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].activeSubscribers, 0)
})

test('slots are reported in day then time order', () => {
  const findings = findSlotAmbiguities([wildcard()], [
    THURSDAY_1900_BST,
    { offering_id: SYNKRON8, starts_at: '2026-09-16T18:00:00Z' }, // Wed 7pm
    MONDAY_2030_BST,
  ])
  assert.deepEqual(findings[0].slots, ['Mondays 8:30pm', 'Wednesdays 7pm', 'Thursdays 7pm'])
})

test('IGNORES occurrences of a different offering', () => {
  // The Kidz Wednesday must not make the SYNKRON8 plan look ambiguous.
  const findings = findSlotAmbiguities([wildcard()], [
    MONDAY_2030_BST,
    { offering_id: KIDZ, starts_at: '2026-09-16T16:00:00Z' },
  ])
  assert.deepEqual(findings, [])
})

test('an offering with NO scheduled occurrences is not ambiguous', () => {
  assert.deepEqual(findSlotAmbiguities([wildcard()], []), [])
})

test('reports each affected plan separately', () => {
  const findings = findSlotAmbiguities(
    [
      wildcard(),
      wildcard({
        planId: 'plan_jam',
        planName: 'Skate Jam — Thursdays',
        offeringId: KIDZ,
        offeringTitle: 'Skate Jam',
        activeSubscribers: 3,
      }),
    ],
    [
      MONDAY_2030_BST,
      THURSDAY_1900_BST,
      { offering_id: KIDZ, starts_at: '2026-09-16T16:00:00Z' },
      { offering_id: KIDZ, starts_at: '2026-09-19T16:00:00Z' },
    ]
  )
  assert.equal(findings.length, 2)
  assert.deepEqual(
    findings.map((f) => f.planName).sort(),
    ['SYNKRON8 — Mondays', 'Skate Jam — Thursdays']
  )
})

test('a plan with an EXPLICIT slot is never passed in, so never reported', () => {
  // Guards the read in findActiveSlotAmbiguities(), which filters on
  // `weekday IS NULL`: Sk8 Skool for Kidz runs two nights and is CORRECT,
  // because each of its plans names one. If that filter were ever dropped,
  // the alert would fire permanently on a correctly configured plan.
  assert.deepEqual(findSlotAmbiguities([], [MONDAY_2030_BST, THURSDAY_1900_BST]), [])
})
