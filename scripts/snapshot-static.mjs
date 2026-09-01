/**
 * Crawls the running storefront into a static site.
 *
 *   npm run build && npx next start -p 3000
 *   node scripts/snapshot-static.mjs
 *
 * The pages this captures are the ones Next already pre-renders from the
 * database, so the snapshot is the real site with real catalogue data — not a
 * mock-up. What it cannot carry is anything that needs a server at request
 * time: adding to the cart, checkout, sign-in, the admin. Those are left as
 * links that lead to a short "needs a server" page rather than a 404.
 *
 * It exists to answer one question — "can I look at the site?" — where the
 * database that the real deployment needs is not reachable from the host doing
 * the looking.
 *
 * Environment:
 *   APP_URL   the running app          (default http://127.0.0.1:3000)
 *   OUT_DIR   where the snapshot goes  (default .devstack/static)
 */

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const APP = (process.env.APP_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const OUT = process.env.OUT_DIR ?? '.devstack/static'

/** Pages worth capturing; everything else is reached by following links. */
const SEEDS = [
  '/',
  '/collections/all',
  '/collections/frontpage',
  '/about',
  '/contact',
  '/cart',
  '/search?q=tee',
]

const NEEDS_SERVER = /^\/(checkout|account|admin|api)(\/|$)/

const seen = new Set()
const assets = new Map() // remote URL -> local path
const pages = new Map() // route -> html

function localAssetPath(url) {
  const u = new URL(url, APP)

  // Next's optimiser serves everything from one route with the real file in a
  // query parameter; flatten that into a predictable name.
  if (u.pathname === '/_next/image') {
    const source = u.searchParams.get('url') ?? ''
    const width = u.searchParams.get('w') ?? ''
    const stem = source.split('/').pop()?.split('?')[0] ?? 'image'
    const key = `${source}|${width}`
    const hash = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)
    return `/_img/${hash}-${width}-${stem.replace(/[^A-Za-z0-9._-]/g, '_')}`
  }

  return u.pathname
}

function routeToFile(route) {
  const [path, query] = route.split('?')
  if (path === '/') return 'index.html'
  const clean = path.replace(/^\/|\/$/g, '')
  // A query string cannot be a directory, so fold it into the name.
  return query ? `${clean}__${query.replace(/[^A-Za-z0-9]/g, '_')}/index.html` : `${clean}/index.html`
}

async function fetchAsset(url) {
  const res = await fetch(new URL(url, APP), {
    headers: { Accept: 'image/avif,image/webp,image/*,*/*' },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return {
    body: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get('content-type') ?? '',
  }
}

/** Rewrites every reference in the HTML to something the snapshot contains. */
function rewrite(html, route) {
  const collect = (raw) => {
    const value = raw.trim().replace(/&amp;/g, '&')
    if (!value || value.startsWith('data:') || value.startsWith('#')) return null
    if (/^https?:\/\//.test(value) && !value.startsWith(APP)) return null // leave third parties alone

    const u = new URL(value, APP)
    if (u.pathname.startsWith('/_next/') || u.pathname.startsWith('/_storage/') ||
        /\.(css|js|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf)$/i.test(u.pathname)) {
      const local = localAssetPath(u.href)
      assets.set(u.href, local)
      return local
    }
    return null
  }

  html = html.replace(/\b(src|href)=(["'])([^"']+)\2/g, (match, attr, quote, raw) => {
    const local = collect(raw)
    return local ? `${attr}=${quote}${local}${quote}` : match
  })

  html = html.replace(/srcSet=(["'])([\s\S]*?)\1|srcset=(["'])([\s\S]*?)\3/gi, (match) => {
    const quoted = match.match(/=(["'])([\s\S]*?)\1/)
    if (!quoted) return match
    const parts = quoted[2]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [url, ...rest] = c.split(/\s+/)
        const local = collect(url)
        return local ? [local, ...rest].join(' ') : null
      })
      .filter(Boolean)
    return parts.length ? `srcset="${parts.join(', ')}"` : match
  })

  // Point the routes that need a live server at an explanation.
  html = html.replace(/href="(\/[^"]*)"/g, (match, href) =>
    NEEDS_SERVER.test(href.split('?')[0]) ? 'href="/needs-a-server/"' : match,
  )

  return html
}

function linksIn(html) {
  const out = new Set()
  for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = match[1]
    if (NEEDS_SERVER.test(href.split('?')[0])) continue
    if (href.startsWith('/_')) continue
    if (/\.[a-z0-9]{2,5}$/i.test(href.split('?')[0])) continue
    out.add(href)
  }
  return out
}

async function main() {
  const queue = [...SEEDS]

  console.log('Crawling pages')
  while (queue.length) {
    const route = queue.shift()
    if (seen.has(route)) continue
    seen.add(route)

    let res
    try {
      res = await fetch(APP + route, { redirect: 'follow' })
    } catch (error) {
      console.log(`  ! ${route}: ${error.message}`)
      continue
    }
    if (!res.ok) {
      console.log(`  ! ${route}: ${res.status}`)
      continue
    }

    const html = await res.text()
    pages.set(route, rewrite(html, route))
    console.log(`  ${route}`)

    for (const href of linksIn(html)) if (!seen.has(href)) queue.push(href)
  }

  /*
   * Stylesheets reference fonts and sprites by RELATIVE path (../media/x.woff2),
   * so those never appear in the HTML and would be missed. Resolve and queue
   * them, or the page renders in fallback faces and every measurement shifts.
   */
  console.log('\nFollowing stylesheet references')
  for (const [url, local] of [...assets]) {
    if (!local.endsWith('.css')) continue
    try {
      const { body } = await fetchAsset(url)
      for (const match of body.toString('utf8').matchAll(/url\((["']?)([^)"']+)\1\)/g)) {
        const ref = match[2]
        if (ref.startsWith('data:')) continue
        const resolved = new URL(ref, new URL(url, APP))
        if (resolved.origin !== new URL(APP).origin) continue
        assets.set(resolved.href, resolved.pathname)
      }
    } catch {
      // a stylesheet we cannot read simply contributes nothing
    }
  }

  console.log(`\nFetching ${assets.size} assets`)
  let failed = 0
  const files = []
  const recoded = new Map() // original path -> .webp path

  for (const [url, local] of assets) {
    try {
      const { body } = await fetchAsset(url)

      /*
       * The catalogue photographs are 2000px originals and the pages display
       * them at 715px at most. Re-encoding to WebP at the size actually used
       * takes the snapshot from ~14MB to something a single upload can carry,
       * and it is what the optimiser would have produced anyway.
       */
      if (/\.(png|jpe?g)$/i.test(local) && !local.endsWith('.svg')) {
        const webp = await sharp(body)
          .resize({ width: Number(process.env.SNAPSHOT_IMAGE_WIDTH ?? 1000), withoutEnlargement: true })
          .webp({ quality: Number(process.env.SNAPSHOT_IMAGE_QUALITY ?? 72) })
          .toBuffer()
        const target = local.replace(/\.(png|jpe?g)$/i, '.webp')
        recoded.set(local, target)
        files.push({ file: target.replace(/^\//, ''), data: webp })
        continue
      }

      files.push({ file: local.replace(/^\//, ''), data: body })
    } catch {
      failed += 1
    }
  }
  console.log(`  ${files.length} stored, ${failed} unavailable, ${recoded.size} re-encoded`)

  // Point the pages at the re-encoded files.
  if (recoded.size) {
    for (const [route, html] of pages) {
      let next = html
      for (const [from, to] of recoded) next = next.split(from).join(to)
      pages.set(route, next)
    }
  }

  console.log('\nWriting')
  for (const [route, html] of pages) {
    const file = routeToFile(route)
    await mkdir(dirname(join(OUT, file)), { recursive: true })
    await writeFile(join(OUT, file), html)
  }
  for (const { file, data } of files) {
    await mkdir(dirname(join(OUT, file)), { recursive: true })
    await writeFile(join(OUT, file), data)
  }

  // The one page that is not a copy of anything.
  await mkdir(join(OUT, 'needs-a-server'), { recursive: true })
  await writeFile(join(OUT, 'needs-a-server/index.html'), NEEDS_SERVER_PAGE)

  console.log(`\n${pages.size} pages, ${files.length} assets -> ${OUT}`)
}

const NEEDS_SERVER_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Needs a live server</title>
<style>
  body { margin:0; background:#fbf7ef; color:#111; font:16px/1.6 Inter, system-ui, sans-serif;
         min-height:100vh; display:grid; place-items:center; padding:32px; }
  main { max-width:38rem; }
  h1 { font-family:'Libre Baskerville', Georgia, serif; font-weight:400; font-size:2rem; margin:0 0 1rem; }
  p { color:#5d5346; }
  a { color:#111; }
</style>
<main>
  <h1>This part needs the live site</h1>
  <p>
    You are looking at a static snapshot of the AMIRIANI storefront, captured
    from the running application so the pages can be browsed without a database
    behind them. The cart, checkout, account and admin all read and write at
    request time, so they are not part of the snapshot.
  </p>
  <p><a href="/">Back to the store</a></p>
</main>
`

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
