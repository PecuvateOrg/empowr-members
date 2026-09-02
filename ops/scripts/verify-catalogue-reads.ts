/**
 * verify-catalogue-reads.ts
 *
 * Run:  npm run verify:catalogue     (from src/)
 *
 * Pins the error policy of the catalogue reads after the 2026-09-02 outage,
 * where every /sessions/[slug] page 404'd on a live payment site.
 *
 * The bug was not that the policy was wrong — it was that the policy was
 * applied to three of four reads and missed on the fourth. `getOffering`
 * returned null on a database error, the page read null as "inactive
 * offering" and called notFound(), and ISR cached the 404. /sessions stayed
 * up the whole time because it reads listActiveOfferings, which throws, so
 * the catalogue looked healthy while nothing could be booked.
 *
 * So the behavioural test alone would not have caught it. The structural
 * test below is the one that matters: it asserts that NO read in
 * catalogue.ts handles its own error, because the one that did is what broke.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { unwrap } from '../../src/lib/catalogue-read.ts'

test('unwrap returns data untouched when there is no error', () => {
  assert.deepEqual(unwrap('read', [{ slug: 'skate-jam' }], null), [{ slug: 'skate-jam' }])
  assert.equal(unwrap('read', null, null), null, 'a genuine null result must pass through')
  assert.equal(unwrap('read', null, undefined), null, 'undefined error is not an error')
})

test('unwrap throws on a database error, naming the read', () => {
  assert.throws(
    () => unwrap('getOffering', null, { message: 'connection reset' }),
    /getOffering failed: connection reset/
  )
})

test('an empty result is NOT an error — only a failure to ask is', () => {
  // The distinction the whole policy rests on: zero active offerings is a
  // real answer, an unreachable database is not.
  assert.deepEqual(unwrap('listActiveOfferings', [], null), [])
})

const catalogueSrc = fs.readFileSync(
  path.join(import.meta.dirname, '..', '..', 'src', 'lib', 'catalogue.ts'),
  'utf8'
)

test('every catalogue query routes its error through unwrap', () => {
  const queries = catalogueSrc.match(/createPublicClient\(\)/g) ?? []
  const unwraps = catalogueSrc.match(/unwrap\(/g) ?? []
  assert.ok(queries.length >= 4, `expected at least 4 catalogue queries, found ${queries.length}`)
  assert.equal(
    unwraps.length,
    queries.length,
    `${queries.length} queries but ${unwraps.length} unwrap() calls — a read is handling its own error`
  )
})

test('no catalogue read swallows an error into a null or empty result', () => {
  // The exact shape of the 2026-09-02 defect. Any `if (error)` block that
  // does not throw is the bug returning.
  const blocks = catalogueSrc.match(/if\s*\(\s*error\s*\)\s*\{[^}]*\}/g) ?? []
  for (const block of blocks) {
    assert.match(
      block,
      /throw/,
      `a catalogue read handles \`error\` without throwing:\n${block}`
    )
  }
})
