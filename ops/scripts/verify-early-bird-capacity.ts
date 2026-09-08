/**
 * verify-early-bird-capacity.ts
 *
 * Run:  npm run verify:early-bird-capacity     (from src/)
 *
 * `mem_occurrences.early_bird_capacity` existed in the database and was READ by
 * the public catalogue, but nothing in the app could ever WRITE it — so the
 * October 2026 camp could be given four dates and no early-bird allocation,
 * and the £40 tier the team had approved would simply never appear. Same shape
 * as the departure-consent gap: a column written by nobody, read by something.
 *
 * Two rules are pinned here, plus one structural check that guards a silent
 * data-loss path.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { occurrenceSchema } from '../../src/lib/validation.ts'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

const base = {
  offering_id: '11111111-1111-4111-8111-111111111111',
  starts_at: '2026-10-26T09:30',
  ends_at: '2026-10-26T14:30',
  venue_id: null,
}

const parse = (over: Record<string, unknown>) =>
  occurrenceSchema.safeParse({ ...base, capacity: 25, early_bird_capacity: null, ...over })

// --- The allocation is carved OUT of capacity -----------------------------

test('an allocation inside capacity is accepted', () => {
  const r = parse({ capacity: 25, early_bird_capacity: 5 })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.early_bird_capacity, 5)
})

test('an allocation EQUAL to capacity is accepted', () => {
  // Every place discounted is a real decision, not an error.
  assert.equal(parse({ capacity: 25, early_bird_capacity: 25 }).success, true)
})

test('SAFEGUARD: an allocation ABOVE capacity is refused', () => {
  // 30 early-bird places on a 25-place session advertises a discount the
  // session cannot physically honour.
  const r = parse({ capacity: 25, early_bird_capacity: 30 })
  assert.equal(r.success, false)
  if (!r.success) {
    assert.match(r.error.issues[0].message, /cannot exceed the session capacity/)
    assert.deepEqual(r.error.issues[0].path, ['early_bird_capacity'])
  }
})

test('null capacity (venue default) cannot be compared, so it is allowed through', () => {
  // The venue default is not visible to the schema. Refusing here would block
  // a legitimate edit; the RPC still enforces real capacity at booking time.
  assert.equal(parse({ capacity: null, early_bird_capacity: 5 }).success, true)
})

// --- null and 0 are different, and both are legal -------------------------

test('null means no early bird is offered on this date', () => {
  const r = parse({ early_bird_capacity: null })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.early_bird_capacity, null)
})

test('0 is accepted and is NOT collapsed into null', () => {
  const r = parse({ early_bird_capacity: 0 })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.early_bird_capacity, 0)
})

test('a blank number input (NaN) becomes null, not a validation error', () => {
  // react-hook-form's valueAsNumber round-trips an empty field as NaN.
  const r = parse({ early_bird_capacity: Number.NaN })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.early_bird_capacity, null)
})

test('a negative allocation is refused', () => {
  assert.equal(parse({ early_bird_capacity: -1 }).success, false)
})

// --- The silent data-loss path -------------------------------------------

test('SAFEGUARD: the admin read SELECTS early_bird_capacity', () => {
  // If the admin occurrence read omits this column, editing any occurrence
  // loads the field EMPTY and saving it writes null — wiping an allocation
  // that was set, with no error and nothing on screen to notice. The form
  // populates from AdminOccurrence, so the read and the form must agree.
  const data = read('lib', 'admin-data.ts')
  assert.match(data, /early_bird_capacity/, 'AdminOccurrence type must carry it')
  const select = data.match(/"id, starts_at, ends_at, venue_id, capacity[^"]*"/)
  assert.ok(select, 'could not find the admin occurrence select')
  assert.match(select[0], /early_bird_capacity/, 'the admin SELECT must include early_bird_capacity')
})

test('the occurrence form renders the field and registers it', () => {
  const form = read('components', 'admin', 'OccurrenceForm.tsx')
  assert.match(form, /register\("early_bird_capacity"/)
  assert.match(form, /early_bird_capacity: initial\.early_bird_capacity/, 'edit branch must prefill it')
  assert.match(form, /early_bird_capacity: null/, 'create branch must default it')
})
