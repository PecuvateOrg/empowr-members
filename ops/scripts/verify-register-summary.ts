/**
 * verify-register-summary.ts
 *
 * Run:  npm run verify:register     (from src/)
 *
 * The over-capacity warning cannot be exercised against real data: as of
 * 2026-09-01 there are zero bookings on all 142 upcoming occurrences, so every
 * register renders the happy path. A test that only asserted the happy path
 * would pass for the same reason the bug is invisible.
 *
 * So the cases below deliberately TRIP the warning, including the case the
 * whole change exists for: a session that is full on people but not full on
 * bookings, because subscribers hold no booking row.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseRegister } from '../../src/lib/register-summary.ts'

test('subscribers push a session over capacity while bookings alone do not', () => {
  // 12 booked + 2 held = 14 of 20 by the booking system's reckoning.
  // 8 subscribers hold no row, so 22 people are actually coming.
  const s = summariseRegister({
    confirmed: 12, attended: 0, pending: 2, subscribers: 8, capacity: 20,
  })
  assert.equal(s.expected, 22)
  assert.equal(s.systemCount, 14, 'subscribers must not count toward the system total')
  assert.equal(s.overCapacity, true)
  assert.equal(s.stillSellable, 6, 'it will keep selling into an already-full room')
})

test('the same session without subscribers is not over capacity', () => {
  const s = summariseRegister({
    confirmed: 12, attended: 0, pending: 2, subscribers: 0, capacity: 20,
  })
  assert.equal(s.expected, 14)
  assert.equal(s.overCapacity, false)
})

test('checking people in makes the system think space reappeared', () => {
  // The RPC counts only ('pending_payment','confirmed'). Move ten of twenty
  // confirmed bookings to attended and its count halves, even though the same
  // twenty people are in the room.
  const before = summariseRegister({
    confirmed: 20, attended: 0, pending: 0, subscribers: 0, capacity: 20,
  })
  const after = summariseRegister({
    confirmed: 10, attended: 10, pending: 0, subscribers: 0, capacity: 20,
  })
  assert.equal(before.expected, after.expected, 'the same people are present')
  assert.equal(before.stillSellable, 0)
  assert.equal(after.stillSellable, 10, 'ten walk-in places appear out of nowhere')
})

test('exactly at capacity is not over capacity', () => {
  const s = summariseRegister({
    confirmed: 15, attended: 0, pending: 0, subscribers: 5, capacity: 20,
  })
  assert.equal(s.expected, 20)
  assert.equal(s.overCapacity, false, 'strictly greater-than, not >=')
  assert.equal(s.stillSellable, 5)
})

test('unlimited capacity never warns and never reports sellable places', () => {
  const s = summariseRegister({
    confirmed: 99, attended: 4, pending: 1, subscribers: 40, capacity: null,
  })
  assert.equal(s.expected, 144)
  assert.equal(s.overCapacity, false)
  assert.equal(s.stillSellable, null)
})

test('an empty register is coherent', () => {
  const s = summariseRegister({
    confirmed: 0, attended: 0, pending: 0, subscribers: 0, capacity: 25,
  })
  assert.deepEqual(
    { e: s.expected, o: s.overCapacity, ss: s.stillSellable },
    { e: 0, o: false, ss: 25 }
  )
})
