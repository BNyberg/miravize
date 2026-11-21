import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://127.0.0.1:8787'
const indexPath = path.join(root, 'dist', 'index.html')

if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html is missing. Run npm run check:build first.')
  process.exit(1)
}

const navigate = {
  Accept: 'text/html',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
}

/** @param {string} url @param {Record<string, string>} headers */
async function follow(url, headers) {
  /** @type {string[]} */
  const seen = []
  let current = url
  for (let hop = 0; hop <= 2; hop += 1) {
    if (seen.includes(current)) throw new Error(`redirect cycle at ${current}`)
    seen.push(current)
    const response = await fetch(current, { headers, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`${current} redirected without a Location header`)
      if (hop === 2) throw new Error(`${url} followed more than two redirects`)
      current = new URL(location, current).href
      continue
    }
    return { response, url: current, hops: hop }
  }
  throw new Error(`${url} followed more than two redirects`)
}

function isHtml(body) {
  const head = body.trimStart().slice(0, 32).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html')
}

/** @param {string} body */
function assetRefs(body) {
  return [...body.matchAll(/\b(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])
}

async function checks() {
  const home = await follow(`${origin}/`, navigate)
  if (home.response.status !== 200) throw new Error(`/ returned ${home.response.status}`)
  const homeBody = await home.response.text()
  if (!homeBody.includes('id="root"')) throw new Error('/ did not serve the application shell')

  for (const route of ['/login', '/timer']) {
    const page = await follow(`${origin}${route}`, navigate)
    if (page.response.status !== 200) throw new Error(`${route} returned ${page.response.status}`)
    const body = await page.response.text()
    if (!body.includes('id="root"')) throw new Error(`${route} did not serve the SPA shell`)
  }

  const refs = assetRefs(homeBody)
  const scripts = refs.filter((ref) => ref.endsWith('.js'))
  const styles = refs.filter((ref) => ref.endsWith('.css'))
  if (scripts.length === 0 || styles.length === 0) throw new Error('index.html is missing a script or stylesheet')
  for (const ref of [...scripts, ...styles]) {
    const asset = await follow(new URL(ref, origin).href, { Accept: '*/*' })
    if (asset.response.status !== 200) throw new Error(`${ref} returned ${asset.response.status}`)
    const type = asset.response.headers.get('content-type') ?? ''
    if (type.includes('text/html')) throw new Error(`${ref} was served as text/html`)
    const body = await asset.response.text()
    if (isHtml(body)) throw new Error(`${ref} returned an HTML document`)
  }

  // Assets-only SPA mode serves index.html for every path that is not a real
  // file, including a missing hashed asset. Sec-Fetch-Mode does not change that
  // in wrangler dev. The guard is that every URL in index.html is a real asset.
  const missing = await follow(`${origin}/assets/missing-file.js`, {
    Accept: '*/*',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'script',
  })
  const missingType = missing.response.headers.get('content-type') ?? ''
  const missingBody = await missing.response.text()
  if (missing.response.status === 200 && !missingType.includes('text/html') && !isHtml(missingBody)) {
    throw new Error('an unknown asset path returned a successful non-HTML body')
  }
  console.log(
    `Unknown asset path: ${missing.response.status} ${missingType || 'no content-type'}. ` +
      'SPA fallback may return index.html; linked assets must not.',
  )

  console.log('Static smoke checks passed.')
}

const child = spawn(
  path.join(root, 'node_modules', '.bin', 'wrangler'),
  ['dev', '--port', '8787', '--ip', '127.0.0.1', '--local', '--show-interactive-dev-session=false'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
)

let logs = ''
child.stdout.on('data', (chunk) => {
  logs += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  logs += chunk.toString()
})

function stop() {
  if (!child.killed) child.kill('SIGTERM')
}

const ready = (async () => {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`wrangler dev exited early\n${logs}`)
    try {
      const response = await fetch(origin, { headers: navigate })
      if (response.ok || response.status === 304) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`wrangler dev did not listen on ${origin}\n${logs}`)
})()

try {
  await ready
  await checks()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  stop()
  await new Promise((resolve) => {
    child.once('exit', resolve)
    setTimeout(resolve, 2_000)
  })
}
