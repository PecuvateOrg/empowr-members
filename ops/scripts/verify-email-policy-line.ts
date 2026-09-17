/**
 * verify-email-policy-line.ts
 *
 * Run:  npm run verify:email-policy-line     (from src/)
 *
 * Pins the cancel/move paragraph in the booking confirmation email against
 * what each offering ACTUALLY allows.
 *
 * The move right is per-offering, not global. Checked live 2026-09-17, of
 * nine active offerings:
 *
 *   transferable   Skate Jam, Sk8 Skool for Kidz, Sk8 Skool for All Ages,
 *                  Roller Skate Events 15+, SYNKRON8
 *   NOT            Roller Quad Camp, All Ages Roller Disco  (non_refundable)
 *   NOT            Beginners Foundation, Prep to Street Skate  (per_run —
 *                  sold as a block, so never moved a class at a time)
 *
 * WHY THIS MATTERS MORE HERE THAN ON A PAGE. A session page can be corrected
 * and the next visitor sees the truth. An email is sent once, after the card
 * is charged, and sits in the member's inbox as the written record of what
 * they were promised. A blanket "you can move this booking" sentence would be
 * a written promise of a control that Roller Quad Camp buyers will never be
 * shown — and that offering is strictly non-refundable with, per the KB,
 * "no discretionary exceptions".
 *
 * The gate mirrors PolicyNotice and evaluateTransferPolicy. These assertions
 * are what stop the three drifting apart.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBookingConfirmationEmail } from '../../src/lib/emails/booking-confirmation.ts'
import {
  CANCELLATION_CUTOFF_HOURS,
  TRANSFER_CUTOFF_HOURS,
} from '../../src/lib/business-rules.ts'
import type { BookingOrderEmailSummary } from '../../src/lib/emails/types.ts'

type Shape = {
  refundPolicy: 'standard' | 'non_refundable'
  transferable: boolean
  enrolmentScope: 'per_occurrence' | 'per_run'
}

function render(shape: Shape): string {
  const summary: BookingOrderEmailSummary = {
    groups: [
      {
        offeringTitle: 'Test Offering',
        when: 'Mon 13 Jul, 4:00–5:00pm',
        venue: null,
        kitList: null,
        participantNames: ['Alfie Barnes'],
        tickets: [{ name: 'Alfie Barnes', url: 'https://example.test/ticket/1' }],
        amountPaidPence: 1000,
        ...shape,
      },
    ],
    amountPaidPence: 1000,
  }
  return buildBookingConfirmationEmail(summary).html
}

const MOVE_PHRASE = 'move it once to another date'

test('a transferable single session offers the move, with the cutoff', () => {
  // Skate Jam, Sk8 Skool (both), Roller Skate Events 15+, SYNKRON8.
  const html = render({
    refundPolicy: 'standard',
    transferable: true,
    enrolmentScope: 'per_occurrence',
  })
  assert.ok(html.includes(MOVE_PHRASE), 'should offer the move')
  assert.ok(
    html.includes(`at least ${TRANSFER_CUTOFF_HOURS} hours away`),
    'should state the transfer cutoff'
  )
  assert.ok(
    html.includes(`${CANCELLATION_CUTOFF_HOURS} hours</strong> before the session`),
    'should still state the cancellation cutoff'
  )
})

test('a non-transferable single session says nothing about moving', () => {
  // The flag alone decides. This is the case that would silently appear if
  // someone flattened the gate to "standard means movable".
  const html = render({
    refundPolicy: 'standard',
    transferable: false,
    enrolmentScope: 'per_occurrence',
  })
  assert.ok(!html.includes(MOVE_PHRASE), 'must not offer a move')
  assert.ok(
    html.includes('cancel this booking yourself'),
    'cancellation is still self-serve'
  )
})

test('a non-refundable offering is told it can be neither cancelled nor moved', () => {
  // Roller Quad Camp, All Ages Roller Disco. Note transferable is TRUE here
  // on purpose: refund_policy must win, because the published text forbids
  // a move in the same breath. This is the combination that shipped wrong
  // once already — the transfer gate ignores refund_policy, so the flag
  // alone would have opened moves the legal copy forbids.
  const html = render({
    refundPolicy: 'non_refundable',
    transferable: true,
    enrolmentScope: 'per_occurrence',
  })
  assert.ok(!html.includes(MOVE_PHRASE), 'must not offer a move')
  assert.ok(html.includes('non-refundable'), 'must say non-refundable')
  assert.ok(
    html.includes("can't be cancelled or moved once booked"),
    'must rule out both, not just refunds'
  )
})

test('a course is cancellable from the COURSE start and never moved per class', () => {
  // Beginners Foundation, Prep to Street Skate. The generic sentence would
  // read the same and mean something different — a class-level 48h rather
  // than 48h before the course begins.
  const html = render({
    refundPolicy: 'standard',
    transferable: true,
    enrolmentScope: 'per_run',
  })
  assert.ok(!html.includes(MOVE_PHRASE), 'a course is never moved a date at a time')
  assert.ok(
    html.includes(`${CANCELLATION_CUTOFF_HOURS} hours</strong> before the course begins`),
    'the cutoff must run from the start of the course, not of a class'
  )
  assert.ok(
    html.includes("sold as a block"),
    'must say why individual classes cannot be moved or cancelled'
  )
})

test('the move sentence never appears for any shape that cannot move', () => {
  // Belt and braces across the whole matrix: the only combination that may
  // mention moving is standard + transferable + per_occurrence.
  for (const refundPolicy of ['standard', 'non_refundable'] as const) {
    for (const transferable of [true, false]) {
      for (const enrolmentScope of ['per_occurrence', 'per_run'] as const) {
        const allowed =
          refundPolicy === 'standard' && transferable && enrolmentScope === 'per_occurrence'
        const html = render({ refundPolicy, transferable, enrolmentScope })
        assert.equal(
          html.includes(MOVE_PHRASE),
          allowed,
          `${refundPolicy}/${transferable}/${enrolmentScope} should ${
            allowed ? '' : 'NOT '
          }mention moving`
        )
      }
    }
  }
})
