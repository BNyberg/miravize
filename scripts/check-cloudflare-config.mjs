import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { configProblems, parseWrangler } from './cloudflare-rules.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'wrangler.toml')

if (!fs.existsSync(file)) {
  console.error('wrangler.toml is missing')
  process.exit(1)
}

const problems = configProblems(root, parseWrangler(fs.readFileSync(file, 'utf8')))
if (problems.length > 0) {
  console.error('Cloudflare configuration check failed:')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log('Cloudflare configuration check passed.')
