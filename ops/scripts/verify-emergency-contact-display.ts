/**
 * verify-emergency-contact-display.ts
 *
 * Run:  npm run verify:emergency-contact-display     (from src/)
 *
 * Covers lib/register-emergency-contact.ts — what the DOOR is told about who
 * to ring. Distinct from verify-emergency-contact.ts, which pins the
 * validation rule that a contact is required at signup; this one is about what
 * staff see when that rule was not in force, or was satisfied uselessly.
 *
 * Both states below are LIVE, not hypothetical (checked 2026-09-07):
 *   - EIGHT of 49 participants have no emergency contact at all, and FOUR live
 *     future bookings belong to them. Staff will meet this at the next
 *     session, so "none on file" has to be a visible state and never a blank.
 *   - ONE participant is recorded as their own emergency contact
 *     ([[feedback_emergency_contact_never_self]]). That is worse than blank
 *     because it LOOKS answered — a name and a number are present, and the
 *     uselessness only surfaces at the moment someone dials it.
 *
 * The load-bearing assertion is that a self-reference WITH a valid phone
 * number does not resolve to `ok`. Checking the phone first would be the
 * natural way to write this function and would produce exactly that bug.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveEmergencyContact,
  telHref,
} from '../../src/lib/register-emergency-contact.ts'

const forName = (name: string) => (
  contactName: string | null,
  phone: string | null
) => resolveEmergencyContact({
  name,
  emergencyContactName: contactName,
  emergencyContactPhone: phone,
})

const freya = forName('Freya Stern')

test('a real contact resolves to ok', () => {
  assert.deepEqual(freya('Anna Stern', '07700 900123'), {
    kind: 'ok',
    name: 'Anna Stern',
    phone: '07700 900123',
  })
})

test('nothing on file is reported, never blank', () => {
  assert.deepEqual(freya(null, null), { kind: 'missing' })
  assert.deepEqual(freya('', ''), { kind: 'missing' })
  assert.deepEqual(freya('   ', '07700 900123'), { kind: 'missing' })
})

test('a name with no number says so', () => {
  assert.deepEqual(freya('Anna Stern', null), {
    kind: 'no_phone',
    name: 'Anna Stern',
  })
})

test('SAFEGUARDING: their own name WITH a valid number is not "ok"', () => {
  // The bug this pins: checking the phone before the self-reference would
  // return ok here, and the door would ring the person on the floor.
  const status = freya('Freya Stern', '07700 900123')
  assert.equal(status.kind, 'self')
  assert.notEqual(status.kind, 'ok')
})

test('the self check ignores case and whitespace', () => {
  assert.equal(freya('  freya stern ', '07700 900123').kind, 'self')
})

test('a different person with a similar name is NOT a self-reference', () => {
  // Siblings and parents share surnames; only the whole name counts.
  assert.equal(freya('Anna Stern', '07700 900123').kind, 'ok')
  assert.equal(freya('Freya Sterne', '07700 900123').kind, 'ok')
})

test('contact names are trimmed for display', () => {
  const status = freya('  Anna Stern  ', '  07700 900123  ')
  assert.deepEqual(status, {
    kind: 'ok',
    name: 'Anna Stern',
    phone: '07700 900123',
  })
})

// --- telHref: only build a link out of something dialable ---

test('a UK mobile becomes a tel: link with the spaces stripped', () => {
  assert.equal(telHref('07700 900123'), 'tel:07700900123')
})

test('an international form keeps its leading +', () => {
  assert.equal(telHref('+44 7700 900123'), 'tel:+447700900123')
})

test('punctuation a parent typed is stripped', () => {
  assert.equal(telHref('(01234) 567-890'), 'tel:01234567890')
})

test('nonsense does NOT become a dead link', () => {
  // Rendered as plain text instead, so staff can read whatever was entered
  // rather than tapping something that cannot dial.
  assert.equal(telHref('ask at reception'), null)
  assert.equal(telHref('123'), null)
  assert.equal(telHref(''), null)
})
