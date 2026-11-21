import assert from 'node:assert/strict'
import test from 'node:test'

import { configProblems, parseWrangler, patternMatches, redirectProblems } from './cloudflare-rules.mjs'

test('the historical Pages splat is a self-matching redirect', () => {
  assert.equal(patternMatches('/*', '/index.html'), true)
  const problems = redirectProblems('/*    /index.html   200\n', { spa: true })
  assert.equal(problems.length, 2)
  assert.match(problems[0], /100324/)
  assert.match(problems[1], /single-page-application/)
})

test('a specific redirect stays legal beside SPA fallback', () => {
  assert.deepEqual(redirectProblems('/docs /help 301\n', { spa: true }), [])
})

test('Pages output dir and an assets binding without a script fail', () => {
  const sections = parseWrangler(`
name = "miravize"
pages_build_output_dir = "dist"

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
`)
  const problems = configProblems('/tmp/does-not-matter', sections)
  assert.ok(problems.some((problem) => problem.includes('pages_build_output_dir')))
  assert.ok(problems.some((problem) => problem.includes('assets.binding')))
})

test('the current production shape passes the key checks', () => {
  const sections = parseWrangler(`
name = "miravize"
compatibility_date = "2026-11-20"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"

[env.staging]
name = "miravize-staging"
`)
  const problems = configProblems('/tmp/does-not-matter', sections).filter((problem) => !problem.startsWith('public/_redirects'))
  assert.deepEqual(problems, [])
})
