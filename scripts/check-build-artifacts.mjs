import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseWrangler, redirectProblems } from './cloudflare-rules.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const indexPath = path.join(dist, 'index.html')

/** @param {string} message */
function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!fs.existsSync(indexPath)) fail('dist/index.html is missing. Run the Vite build first.')

const html = fs.readFileSync(indexPath, 'utf8')
const refs = [...html.matchAll(/\b(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])
if (refs.length === 0) fail('dist/index.html does not reference a JavaScript or CSS file.')

let scripts = 0
let styles = 0
for (const ref of refs) {
  const relative = ref.startsWith('/') ? ref.slice(1) : ref
  const file = path.join(dist, relative)
  if (!fs.existsSync(file)) fail(`dist/index.html references ${ref}, which is not in dist.`)
  const body = fs.readFileSync(file)
  const head = body.subarray(0, 32).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    fail(`${ref} is an HTML document. A missing asset must not be served as the SPA shell.`)
  }
  if (ref.endsWith('.js')) scripts += 1
  if (ref.endsWith('.css')) styles += 1
}
if (scripts === 0) fail('dist/index.html does not reference a JavaScript file.')
if (styles === 0) fail('dist/index.html does not reference a CSS file.')

const wrangler = parseWrangler(fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8'))
const spa = wrangler.assets?.not_found_handling === 'single-page-application'
const redirects = path.join(dist, '_redirects')
if (fs.existsSync(redirects)) {
  const problems = redirectProblems(fs.readFileSync(redirects, 'utf8'), { spa })
  if (problems.length > 0) {
    console.error('dist/_redirects failed:')
    for (const problem of problems) console.error(`- ${problem}`)
    process.exit(1)
  }
}

let largest = { name: '', bytes: 0 }
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.js')) {
      const bytes = fs.statSync(full).size
      if (bytes > largest.bytes) largest = { name: path.relative(dist, full), bytes }
    }
  }
}
walk(dist)
const kib = (largest.bytes / 1024).toFixed(1)
console.log(`Largest JavaScript chunk: ${largest.name} (${kib} KiB before gzip). This is a performance note, not a failure.`)
console.log('Build artifact check passed.')
