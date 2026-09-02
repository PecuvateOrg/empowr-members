/**
 * verify-scheduled-function.ts
 *
 * Run:  npm run verify:scheduled     (from src/)
 *
 * Pins the invariant behind a bug that shipped to production on 2026-09-02
 * and was invisible to every gate we had: `tsc --noEmit` passed, `next build`
 * passed, and the Netlify deploy reported the function as deployed
 * successfully — because none of them bundle or invoke a Netlify function.
 * It would have failed at 03:15 UTC, on its first line, every night, in a log
 * nobody reads.
 *
 * THE TRAP: `server-only` is not a lint marker, it is a module that throws.
 * Its exports map is { "react-server": "./empty.js", "default": "./index.js" }
 * and index.js is a bare `throw`. Next.js server components resolve the
 * react-server condition and get the no-op; an esbuild-bundled Netlify
 * function sets no such condition, takes the default, and dies on import.
 *
 * So: anything reachable from netlify/functions/ must not carry the guard.
 * That is why lib/materialize-member-bookings.ts takes its Supabase client as
 * a parameter instead of importing lib/supabase/service.ts, which keeps its
 * guard (correctly — it holds the service-role key).
 *
 * STRUCTURAL, like verify-catalogue-reads.ts, and for the same reason: the
 * failure is not a wrong value a unit test would catch, it is an import that
 * is fine everywhere except the one place it runs.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.join(import.meta.dirname, '..', '..', 'src')
const read = (...parts: string[]) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8')

/** Source with // and /* comments stripped — these files deliberately NAME
 *  the dangerous import in prose so the next reader knows what not to do. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

const FUNCTIONS_DIR = path.join(srcDir, 'netlify', 'functions')

/** Every module a Netlify function can reach, followed through relative and
 *  "@/" imports. Deliberately a real graph walk rather than a check of the
 *  entry file alone: the bug was one level down, not in the function. */
function reachableModules(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    const source = codeOnly(fs.readFileSync(file, 'utf8'))
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

    for (const spec of specifiers) {
      let resolved: string | null = null
      if (spec.startsWith('@/')) resolved = path.join(srcDir, spec.slice(2))
      else if (spec.startsWith('.')) resolved = path.join(path.dirname(file), spec)
      if (!resolved) continue // bare package import — not ours to walk

      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, resolved]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          queue.push(candidate)
          break
        }
      }
    }
  }
  return [...seen]
}

test('every scheduled function exists and is reachable', () => {
  const entries = fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(FUNCTIONS_DIR, f))
  assert.ok(entries.length > 0, 'expected at least one Netlify function')
})

test('nothing a Netlify function imports carries `server-only`', () => {
  const entries = fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(FUNCTIONS_DIR, f))

  for (const entry of entries) {
    for (const module of reachableModules(entry)) {
      const source = codeOnly(fs.readFileSync(module, 'utf8'))
      assert.doesNotMatch(
        source,
        /import\s+['"]server-only['"]/,
        `${path.relative(srcDir, module)} carries \`import "server-only"\` and is reachable ` +
          `from ${path.basename(entry)}. server-only THROWS in a non-react-server bundle, so ` +
          `this function would die on import at its scheduled time. Take the dependency as a ` +
          `parameter instead (see lib/materialize-member-bookings.ts).`
      )
    }
  }
})

test('the reconciliation module is reachable from the scheduled function', () => {
  // Guards the test above against passing vacuously: if the import were ever
  // dropped, "no server-only in the graph" would be trivially true.
  const entry = path.join(FUNCTIONS_DIR, 'materialize-member-bookings.ts')
  const modules = reachableModules(entry).map((m) => path.relative(srcDir, m).replace(/\\/g, '/'))
  assert.ok(
    modules.includes('lib/materialize-member-bookings.ts'),
    `expected the scheduled function to reach the reconciliation module; walked: ${modules.join(', ')}`
  )
})
