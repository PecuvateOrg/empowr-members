/**
 * verify-catalogue-reads.ts
 *
 * Run:  npm run verify:catalogue     (from src/)
 *
 * Pins the two invariants behind the 2026-09-02 outage, where every
 * /sessions/[slug] page 404'd on a live payment site while /sessions kept
 * listing them — so customers could browse the catalogue and open nothing.
 *
 * Both tests here are STRUCTURAL, and deliberately so. Neither bug was a
 * wrong behaviour a unit test would catch: one was a correct policy applied
 * to three of four reads, the other a single line that is perfectly valid on
 * any route except the one it was on.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { unwrap } from '../../src/lib/catalogue-read.ts'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

/** Source with // comments removed. The files below deliberately QUOTE the
 *  dangerous pattern in their comments as the thing not to do, and that must
 *  not read as a violation. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      // Both comment styles: these files deliberately NAME the dangerous calls
      // in prose so the next reader knows what not to do.
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// 1. A failed read must never be mistaken for an empty one.
// ---------------------------------------------------------------------------

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
  assert.deepEqual(unwrap('listActiveOfferings', [], null), [])
})

test('every catalogue query routes its error through unwrap', () => {
  const src = read('lib', 'catalogue.ts')
  const queries = src.match(/createPublicClient\(\)/g) ?? []
  const unwraps = src.match(/unwrap\(/g) ?? []
  assert.ok(queries.length >= 4, `expected at least 4 catalogue queries, found ${queries.length}`)
  assert.equal(
    unwraps.length,
    queries.length,
    `${queries.length} queries but ${unwraps.length} unwrap() calls — a read is handling its own error`
  )
})

test('no catalogue read swallows an error into a null or empty result', () => {
  const blocks = read('lib', 'catalogue.ts').match(/if\s*\(\s*error\s*\)\s*\{[^}]*\}/g) ?? []
  for (const block of blocks) {
    assert.match(block, /throw/, `a catalogue read handles \`error\` without throwing:\n${block}`)
  }
})

// ---------------------------------------------------------------------------
// 2. Invalidation must never destroy the static param set.
//
// revalidatePath() on a dynamic route PATTERN discards the prerenders for a
// segment whose params exist only because generateStaticParams ran at BUILD
// time. With dynamicParams = false nothing regenerates them, so every page in
// that segment 404s until someone rebuilds. Proven live: one admin save took
// 9/9 session pages from 200 to 404 — and the edits that trigger it are the
// ordinary ones, because shouldRebuildForOfferingChange() correctly declines
// to rebuild for a price or copy change.
// ---------------------------------------------------------------------------

test('revalidateCatalogue never revalidates a dynamic route PATTERN', () => {
  const calls = codeOnly(read('lib', 'revalidate.ts')).match(/revalidatePath\([^)]*\)/g) ?? []
  assert.ok(calls.length > 0, 'expected revalidateCatalogue to still revalidate something')
  for (const call of calls) {
    assert.doesNotMatch(
      call,
      /\[[^\]]+\]/,
      'revalidatePath called on a dynamic route pattern — this deletes the static ' +
        `param set and 404s every page in that segment:\n${call}`
    )
  }
})

test('revalidateCatalogue never calls revalidateTag', () => {
  // Proven on production 2026-09-02: removing only the revalidatePath was NOT
  // enough. revalidateTag(CATALOGUE_TAG) alone still took all 9 session pages
  // to 404 on the very next admin save, because that tag is carried by the
  // cached reads /sessions/[slug] renders from. ANY on-demand invalidation of
  // a dynamicParams = false route destroys it.
  assert.doesNotMatch(
    codeOnly(read('lib', 'revalidate.ts')),
    /revalidateTag\s*\(/,
    'revalidateCatalogue calls revalidateTag — this 404s every session page ' +
      'until someone rebuilds. Rebuild instead; see lib/revalidate.ts.'
  )
})

test('every catalogue write rebuilds', () => {
  // The rebuild must stay INSIDE revalidateCatalogue. There are 12 call sites,
  // and this project has already shipped one outage caused by a rule applied
  // to some of them and forgotten on the rest.
  assert.match(
    codeOnly(read('lib', 'revalidate.ts')),
    /triggerCatalogueRebuild\s*\(/,
    'revalidateCatalogue no longer rebuilds — session pages cannot recover without it'
  )
})

test('the session detail route still refuses unknown slugs', () => {
  // The pairing that makes the rule above necessary: dynamicParams = false is
  // what turns a discarded param set into a 404 rather than an on-demand
  // render. If this is ever relaxed, revisit the rule — do not just delete it.
  const pageSrc = read('app', '(public)', 'sessions', '[slug]', 'page.tsx')
  assert.match(pageSrc, /export const dynamicParams = false/)
})
