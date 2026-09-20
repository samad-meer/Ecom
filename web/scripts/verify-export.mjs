/**
 * Post-build gate for the static export.
 *
 * The site is uploaded to cPanel by hand, so nothing between `next build` and
 * real users would otherwise notice that the build is broken. Two ways it has
 * already gone wrong, both silent:
 *
 *   1. `.env.local` outranks `.env.production` in Next's load order and is
 *      loaded in every environment, so a dev file baked http://localhost:8002
 *      into a production bundle. The panel loads and then fails to fetch
 *      anything, with every image broken.
 *   2. `.htaccess` was missing from the upload, so /products/<id> hit Apache's
 *      own 404 instead of the client-rendered shell.
 *
 * Both are invisible in `out/` unless you go looking. This looks.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'out'
const problems = []

if (!existsSync(OUT)) {
  console.error(`verify-export: ${OUT}/ does not exist — did next build run?`)
  process.exit(1)
}

// ── 1. Nothing local-only may be baked into a shipped bundle ────────────────
// Scheme required on purpose. Next's polyfill bundle contains the bare word
// "localhost" in feature-detection code; only a real origin we would fetch
// from is a problem.
const LOCAL = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?/g
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const textFiles = walk(OUT).filter((f) => /\.(js|html|txt|json|css)$/.test(f))
const offenders = new Map()
for (const f of textFiles) {
  const hits = readFileSync(f, 'utf8').match(LOCAL)
  if (hits) {
    for (const h of new Set(hits)) {
      if (!offenders.has(h)) offenders.set(h, [])
      offenders.get(h).push(f)
    }
  }
}
if (offenders.size) {
  problems.push(
    'Local-only URLs are baked into the build:\n' +
      [...offenders.entries()]
        .map(([url, files]) => `      ${url}  (${files.length} file(s), e.g. ${files[0]})`)
        .join('\n') +
      '\n    Cause: an .env.local / .env.development.local value reached a production build.\n' +
      '    Next loads .env.local in EVERY environment and it outranks .env.production.\n' +
      '    Keep dev overrides in .env.development.local, which only `next dev` reads.',
  )
}

// ── 2. Files Apache needs that are easy to leave behind ─────────────────────
const required = [
  ['.htaccess', 'the rewrite that serves /products/<id>; without it every product URL is an Apache 404'],
  ['404.html', 'the error page .htaccess points ErrorDocument at'],
  ['products/_/index.html', 'the client-rendered shell the product rewrite targets'],
  ['products/_/index.txt', 'the client-rendered shell RSC payload the prefetch rewrite targets'],
  ['index.html', 'the site root'],
]
for (const [rel, why] of required) {
  if (!existsSync(join(OUT, rel))) problems.push(`Missing ${OUT}/${rel} — ${why}`)
}

if (problems.length) {
  console.error('\nverify-export FAILED — this build must not be uploaded:\n')
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`))
  process.exit(1)
}

console.log(
  `verify-export OK — ${textFiles.length} files scanned, no local URLs, ` +
    `.htaccess + 404.html + product shell present.`,
)
