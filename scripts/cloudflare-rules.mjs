import fs from 'node:fs'
import path from 'node:path'

/** Minimal Wrangler TOML reader for the keys Phase 1 has to guard. */
export function parseWrangler(text) {
  /** @type {Record<string, Record<string, string>>} */
  const sections = { '': {} }
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      section = header[1].trim()
      sections[section] ??= {}
      continue
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line)
    if (!kv) continue
    let value = kv[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    sections[section] ??= {}
    sections[section][kv[1]] = value
  }
  return sections
}

/** Cloudflare `*` matches across path segments. */
export function patternMatches(pattern, target) {
  const pathOnly = target.split('?')[0] ?? target
  let expression = '^'
  for (const char of pattern) {
    expression += char === '*' ? '.*' : char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  expression += '$'
  return new RegExp(expression).test(pathOnly)
}

/**
 * @param {string} text
 * @param {{ spa: boolean }} options
 * @returns {string[]}
 */
export function redirectProblems(text, { spa }) {
  /** @type {string[]} */
  const problems = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) {
      problems.push(`line ${index + 1}: a redirect needs a source and a destination`)
      continue
    }
    const [source, destination, status] = parts
    const destPath = (destination.split('?')[0] ?? destination).replace(/\/+$/, '') || '/'
    if (patternMatches(source, destPath)) {
      const code = status ? ` (${status})` : ''
      problems.push(
        `line ${index + 1}: ${source} matches its own destination ${destPath}${code}. ` +
          'The historical rule `/* /index.html 200` fails Cloudflare with error 100324.',
      )
    }
    const catchAll = source === '/*' || source === '*'
    const toIndex = destPath === '/index.html'
    if (spa && catchAll && toIndex) {
      problems.push(
        `line ${index + 1}: a catch-all rewrite to /index.html conflicts with not_found_handling = "single-page-application"`,
      )
    }
  }
  return problems
}

/**
 * @param {string} root
 * @param {Record<string, Record<string, string>>} sections
 */
export function configProblems(root, sections) {
  /** @type {string[]} */
  const problems = []
  const top = sections[''] ?? {}
  const assets = sections.assets ?? {}

  if (top.name !== 'miravize') {
    problems.push(`top-level name must be "miravize" (found ${top.name ?? 'nothing'})`)
  }
  if (assets.directory !== './dist') {
    problems.push(`assets.directory must be "./dist" (found ${assets.directory ?? 'nothing'})`)
  }
  if (assets.not_found_handling !== 'single-page-application') {
    problems.push(
      `assets.not_found_handling must be "single-page-application" (found ${assets.not_found_handling ?? 'nothing'})`,
    )
  }

  for (const [name, values] of Object.entries(sections)) {
    const where = name || 'top level'
    if ('pages_build_output_dir' in values) {
      problems.push(`${where} sets pages_build_output_dir. This app deploys as a Workers Static Assets worker, not Pages.`)
    }
    if ('site' in values || name === 'site' || name.endsWith('.site')) {
      problems.push(`${where} uses Workers Sites. Use [assets] instead.`)
    }
  }

  const main = top.main
  if (main) {
    const mainPath = path.resolve(root, main)
    if (!fs.existsSync(mainPath)) {
      problems.push(`main points at ${main}, which does not exist`)
    }
  }
  if (assets.binding && !main) {
    problems.push('assets.binding is set without a Worker main script. An assets-only worker cannot declare a binding.')
  }

  const spa = assets.not_found_handling === 'single-page-application'
  const redirects = path.join(root, 'public', '_redirects')
  if (fs.existsSync(redirects)) {
    for (const problem of redirectProblems(fs.readFileSync(redirects, 'utf8'), { spa })) {
      problems.push(`public/_redirects ${problem}`)
    }
  }

  return problems
}
