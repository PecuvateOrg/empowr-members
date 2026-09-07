/**
 * verify-course-run-visibility.ts
 *
 * Run:  npm run verify:course-run-visibility     (from src/)
 *
 * Pins the rule that decides whether a course run has finished, and the
 * ONE place it is allowed to live.
 *
 * Two bugs sit behind this file:
 *
 *  1. The public session page listed every run ever returned, under a
 *     heading reading "Upcoming courses", sorted ascending — so a finished
 *     block sat at the top advertising a course getBookableCourseRun()
 *     already refused. The button led to a bare 404.
 *
 *  2. The "has it finished?" comparison existed twice and the two copies
 *     disagreed: lib/booking.ts compared against a UTC date, while
 *     lib/reconcile-brevo.ts compared against a Europe/London date. For
 *     about an hour each BST night they answered differently.
 *
 * The behavioural tests below pin the rule. The structural test pins where
 * it may be applied — that one is not a unit-test concern, it guards a
 * regression that is invisible on this page and shows up on a different one.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isCourseRunOver, londonToday } from '../../src/lib/catalogue-filters.ts'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

// --- The rule -------------------------------------------------------------

test('a run is still on during its final day', () => {
  // ends_on is the last class, not the day after it.
  const noon = new Date('2026-10-06T12:00:00Z')
  assert.equal(isCourseRunOver('2026-10-06', noon), false)
})

test('a run is over the day after it ends', () => {
  assert.equal(isCourseRunOver('2026-10-06', new Date('2026-10-07T12:00:00Z')), true)
})

test('a run with no end date is never over', () => {
  // "No stated finish" is not "finished" — hiding it would be a guess.
  assert.equal(isCourseRunOver(null, new Date('2030-01-01T12:00:00Z')), false)
  assert.equal(isCourseRunOver(undefined, new Date('2030-01-01T12:00:00Z')), false)
})

test('the comparison is Europe/London, not UTC', () => {
  // 00:30 on 7 Oct in London is still 23:30 on 6 Oct in UTC (BST, +1).
  // The run ended on the 6th, so in London it is over. The UTC comparison
  // this replaced answered "not over" for that hour — this is the case that
  // separates the two, and it fails against the old `toISOString()` rule.
  const justAfterMidnightLondon = new Date('2026-10-06T23:30:00Z')
  assert.equal(londonToday(justAfterMidnightLondon), '2026-10-07')
  assert.equal(isCourseRunOver('2026-10-06', justAfterMidnightLondon), true)

  // Sanity: the same instant under the old UTC rule said the opposite.
  const utcToday = justAfterMidnightLondon.toISOString().slice(0, 10)
  assert.equal(utcToday, '2026-10-06')
  assert.equal('2026-10-06' < utcToday, false)
})

test('GMT half of the year still resolves to the London date', () => {
  const winter = new Date('2027-01-26T23:30:00Z')
  assert.equal(londonToday(winter), '2027-01-26')
  assert.equal(isCourseRunOver('2027-01-26', winter), false)
})

// --- Where the rule may be applied ---------------------------------------

test('every caller imports the shared rule instead of inlining a date compare', () => {
  for (const file of [
    ['lib', 'booking.ts'],
    ['lib', 'reconcile-brevo.ts'],
    ['app', '(public)', 'sessions', '[slug]', 'page.tsx'],
  ]) {
    const source = read(...file)
    assert.match(
      source,
      /import \{[^}]*isCourseRunOver[^}]*\} from "@\/lib\/catalogue-filters"/,
      `${file.join('/')} must import isCourseRunOver rather than re-deriving it`
    )
    assert.doesNotMatch(
      source,
      /toISOString\(\)\.slice\(0, 10\)/,
      `${file.join('/')} still derives its own comparison date — that is how the UTC/London split happened`
    )
  }
})

test('listCourseRuns() stays UNFILTERED — the venue read depends on it', () => {
  // listOfferingsWithVenues() derives the venue on the /sessions listing
  // cards from these same rows. Prep to Street Skate has no offering-level
  // venue (its two levels run at different parks and set it per run), so
  // filtering inside the shared read would empty that list once its runs
  // were past and its card would show no venue at all. The filter belongs
  // at the display site. This test is the reason that stays true.
  const catalogue = read('lib', 'catalogue.ts')
  const listCourseRuns = catalogue.slice(catalogue.indexOf('export const listCourseRuns'))
  const body = listCourseRuns.slice(0, listCourseRuns.indexOf('["catalogue:course-runs"]'))

  assert.doesNotMatch(
    body,
    /isCourseRunOver|\.gte\(|\.lt\(/,
    'listCourseRuns() must return every run — filter at the display site instead'
  )
  assert.match(
    catalogue,
    /listOfferingsWithVenues[\s\S]*listCourseRuns/,
    'listOfferingsWithVenues() is the second caller this protects; if it no longer reads runs, revisit this rule'
  )
})
