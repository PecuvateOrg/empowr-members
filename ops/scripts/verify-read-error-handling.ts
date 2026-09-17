/**
 * verify-read-error-handling.ts
 *
 * Run:  npm run verify:read-error-handling     (from src/)
 *
 * Guards against the single most expensive habit in this codebase:
 *
 *     const { data } = await supabase.from(...)...
 *
 * supabase-js RETURNS errors rather than throwing, so a destructure that
 * drops `error` turns a failed query into `data === null`. Every caller then
 * reads that as "there is nothing here" — and renders it as an empty list, a
 * missing booking, or a clean bill of health.
 *
 * On 2026-09-17 that cost two hours of production: a second foreign key made
 * an embed ambiguous to PostgREST (PGRST201), /bookings dropped the error,
 * and members with live bookings were told "No upcoming bookings yet". tsc,
 * next build and every unit test stayed green throughout, because none of
 * them makes a PostgREST request.
 *
 * WHY A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST. The failure needs a
 * broken database to reproduce, which no suite here can stage. What CAN be
 * pinned is the shape of the code, and the shape is the whole bug — the
 * moment `error` is destructured, the compiler and the reviewer both see it.
 * This is a ratchet, not a proof of correctness.
 *
 * ADDING A NEW SITE. If this fails on a file you just wrote, the fix is
 * almost always to handle `error`, not to add an entry below. Only add one
 * when a silent null is genuinely the right outcome, and say why.
 *
 * ⚠️ WHAT THIS DOES NOT CATCH — green here is not "no silent failures".
 * It matches one exact shape: a destructure of `data` ALONE. These all slip
 * through, and none of them is hypothetical:
 *
 *   const { data, count } = await ...      // takes a second field, not error
 *   const { data: rows, status } = ...     // same
 *   const res = await ...; res.data        // never destructured at all
 *   await supabase.rpc(...)                // .rpc(), .auth.admin, storage —
 *                                          // same return contract, and only
 *                                          // caught if written as `{ data }`
 *
 * It is a ratchet against the one habit that has actually cost production
 * time, not a proof that every read is handled. Reviewing a new read still
 * means asking what an unnoticed `null` would render as.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

/** `const { data } = await ...` / `const { data: x } = await ...` — a
 *  destructure that takes data and nothing else. */
const BARE_READ = /const\s*\{\s*data(?:\s*:\s*[A-Za-z_$][\w$]*)?\s*\}\s*=\s*await\s/g

/**
 * Sites deliberately left as-is, with the count expected in each file.
 *
 * All of these are staff-facing: an admin is looking at the screen, knows
 * what they expected to see, and can say "that's wrong" — which is exactly
 * the feedback loop a member does not have. They are a real backlog item,
 * not a blessing, and were kept out of the 2026-09-17 sweep to keep a
 * change to a trading platform reviewable.
 */
const ALLOWED: Record<string, number> = {
  'app/api/admin/occurrences/[id]/cancel/route.ts': 2,
  'app/api/admin/offerings/[id]/route.ts': 1,
  'app/api/admin/walk-ins/route.ts': 1,
  'lib/admin-data.ts': 3,
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.netlify', 'public'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function scan(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8')
    // Strip comments so the warning ON this very pattern in
    // app/(member)/bookings/page.tsx is not counted as an instance of it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const hits = code.match(BARE_READ)?.length ?? 0
    if (hits > 0) {
      counts[path.relative(SRC, file).split(path.sep).join('/')] = hits
    }
  }
  return counts
}

test('no member-facing read drops its error', () => {
  const found = scan()
  const unexpected = Object.entries(found).filter(
    ([file, count]) => (ALLOWED[file] ?? 0) < count
  )

  assert.deepEqual(
    unexpected,
    [],
    unexpected.length === 0
      ? ''
      : `These reads discard \`error\`, so a failed query will render as ` +
          `empty rather than as a fault:\n` +
          unexpected
            .map(([file, count]) => `  ${file} (${count})`)
            .join('\n') +
          `\n\nHandle \`error\` — check it and throw, or log it where a ` +
          `fail-closed null is genuinely correct.`
  )
})

test('the allowlist has no stale entries', () => {
  const found = scan()
  const stale = Object.keys(ALLOWED).filter(
    (file) => (found[file] ?? 0) < ALLOWED[file]
  )

  // A shrinking count is good news, but leaving the old number behind means
  // the guard quietly stops noticing a regression back up to it.
  assert.deepEqual(
    stale,
    [],
    `These allowlist entries now claim more sites than exist — lower the ` +
      `count or drop the entry:\n${stale.map((f) => `  ${f}`).join('\n')}`
  )
})
