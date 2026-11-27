/**
 * verify-sso-marker.ts
 *
 * Run:  npm run verify:sso-marker     (from src/)
 *
 * A session opened by "Sign in with Empowr Dashboard" ends after 12 hours. The
 * only thing that ends it is ssoSessionExpired() returning true, and it fails
 * SILENTLY the other way: a wrong answer of false leaves the admin signed in
 * for Supabase's full lifetime with no error anywhere. These cases pin both
 * directions, including that a marker from another session never signs out
 * the current one (a member who later signed in with an email code).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { SSO_SESSION_HOURS, ssoMarker, ssoSessionExpired } from '../../src/lib/sso-marker.ts'

const START = Date.UTC(2026, 10, 27, 9, 0, 0)
const HOUR = 3_600_000
const marker = ssoMarker('session-a', START)

test('the window is 12 hours', () => {
  assert.equal(SSO_SESSION_HOURS, 12)
})

test('the same session inside 12 hours is still open', () => {
  assert.equal(ssoSessionExpired(marker, 'session-a', START), false)
  assert.equal(ssoSessionExpired(marker, 'session-a', START + 12 * HOUR - 1), false)
})

test('the same session at or after 12 hours has ended', () => {
  assert.equal(ssoSessionExpired(marker, 'session-a', START + 12 * HOUR), true)
  assert.equal(ssoSessionExpired(marker, 'session-a', START + 30 * 24 * HOUR), true)
})

test('a marker never ends a different session', () => {
  assert.equal(ssoSessionExpired(marker, 'session-b', START + 13 * HOUR), false)
})

test('no marker, no session id, or a damaged marker ends nothing', () => {
  assert.equal(ssoSessionExpired(undefined, 'session-a', START + 13 * HOUR), false)
  assert.equal(ssoSessionExpired(marker, undefined, START + 13 * HOUR), false)
  assert.equal(ssoSessionExpired('no-dot', 'no-dot', START + 13 * HOUR), false)
  assert.equal(ssoSessionExpired('session-a.not-a-number', 'session-a', START + 13 * HOUR), false)
  assert.equal(ssoSessionExpired('.123', '', START + 13 * HOUR), false)
})

test('a session id containing a dot still matches', () => {
  const dotted = ssoMarker('a.b.c', START)
  assert.equal(ssoSessionExpired(dotted, 'a.b.c', START + 13 * HOUR), true)
})
