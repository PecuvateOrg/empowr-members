/**
 * verify-plan-seasons.ts
 *
 * Run:  npm run verify:seasons     (from src/)
 *
 * The seasonal disclosure fails SILENTLY. seasonForPlan() returns null for a
 * key it does not recognise, and null is also the correct answer for the four
 * year-round plans — so a mistyped or renamed key does not error, it just
 * quietly stops telling buyers that Skate Jam stops for five months.
 *
 * The key below was corroborated against the live database on 2026-09-01
 * (mem_membership_plans.stripe_lookup_key). These assertions pin it so an
 * edit cannot break the disclosure without breaking a test.
 *
 * What this CANNOT catch: the key changing in the database, or the copy
 * drifting from the KB. The first needs the live plan set; the second is a
 * human check against vaults/EMPOWR CIC/entities/sessions.md.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { seasonForPlan } from '../../src/lib/plan-seasons.ts'

const SKATE_JAM = 'members_skate_jam_monthly'

// Live keys, read from mem_membership_plans on 2026-09-01.
const YEAR_ROUND = [
  'members_sk8_skool_all_ages_monthly',
  'members_sk8_skool_kidz_mon_monthly',
  'members_sk8_skool_kidz_wed_monthly',
  'members_synkron8_monthly',
]

test('Skate Jam discloses its season', () => {
  const season = seasonForPlan(SKATE_JAM)
  assert.ok(season, `no season for "${SKATE_JAM}" — the disclosure would not render`)
  assert.match(season.window, /3 September/)
  assert.match(season.window, /25 March/)
  assert.match(season.detail, /pauses automatically/)
  assert.match(season.detail, /nothing to cancel or re-subscribe/)
})

test('the four year-round plans disclose nothing', () => {
  for (const key of YEAR_ROUND) {
    assert.equal(seasonForPlan(key), null, `${key} must not claim a season`)
  }
})

test('an unknown or missing key is null, never a throw', () => {
  // The plan page renders this on every subscribe view; throwing here would
  // take the page down rather than omit a paragraph.
  assert.equal(seasonForPlan(null), null)
  assert.equal(seasonForPlan(undefined), null)
  assert.equal(seasonForPlan(''), null)
  assert.equal(seasonForPlan('members_not_a_real_plan'), null)
})
