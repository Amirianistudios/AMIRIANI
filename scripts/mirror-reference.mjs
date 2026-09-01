/**
 * Mirrors the reference Shopify storefront locally and serves it.
 *
 *   node scripts/mirror-reference.mjs          # fetch, then serve on :8899
 *   node scripts/mirror-reference.mjs --serve  # serve an existing mirror
 *
 * Why this exists: compare-visual.mjs drives a real browser, and a browser
 * cannot always reach the reference store directly — a corporate proxy, an
 * egress policy, or a CI runner without general internet all break it, and the
 * comparison then silently has nothing to compare against. `fetch` usually
 * still gets through where the browser does not, so we pull the pages and every
 * asset they reference over HTTP and serve them back on localhost under the
 * *real* URL paths. compare-visual then points at this with no other changes:
 *
 *   REF_BASE=http://127.0.0.1:8899 npm run compare
 *
 * The fonts matter more than anything else here. If the mirrored @font-face
 * files 404, the browser substitutes a fallback and every text measurement
 * shifts — which reads as a fidelity bug in the rebuild when it is an artefact
 * of the mirror. That is why fonts are fetched like any other asset and why the
 * summary prints how many were stored.
 *
 * This is a comparison fixture, not a redistribution of the store: it is
 * written to a gitignored directory and served only on loopback.
 *
 * Known limitation: sections the reference fills over AJAX come out empty.
 * The product page's `<product-recommendations>` element fetches
 * /recommendations/products after load, so in the mirror the "You may also
 * like" grid is absent and compare-visual reports its selectors as "missing on
 * reference". On the live store that section does render — check it against
 * the real origin before treating such a report as a difference in the
 * rebuild.
 */

import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'

const STORE = (process.env.SHOPIFY_STORE_URL ?? 'https://7t6swe-yh.myshopify.com').replace(/\/$/, '')
const HOST = new URL(STORE).host
const OUT = resolve(process.cwd(), process.env.MIRROR_DIR ?? '.reference-mirror')
const PORT = Number(process.env.MIRROR_PORT ?? 8899)
const SERVE_ONLY = process.argv.includes('--serve')

/**
 * The pages compare-visual asks for, keyed by the path it will request.
 * Prices vary by Shopify market, so pin the same one the extract used —
 * otherwise the reference shows different numbers than the rebuild and every
 * price element reads as a mismatch.
 */
const PAGES = ['/', '/collections/all', '/products/oversized-high-neck-t-shirt-unisex-fit', '/cart']
const MARKET = process.env.SHOPIFY_MARKET_COUNTRY ?? 'BE'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

/** Where an absolute asset URL is stored, and the path we rewrite it to. */
function assetPath(url) {
  const u = new URL(url)
  let key = `${u.host}${u.pathname}`.replace(/[^A-Za-z0-9._/-]/g, '_')
  // Shopify serves many sizes of the same file; keep them distinct.
  const width = u.searchParams.get('width')
  if (width) {
    const ext = extname(key)
    key = `${key.slice(0, key.length - ext.length)}_w${width}${ext}`
  }
  return `/_mirror/${key}`
}

function absolute(url) {
  const raw = url.trim().replace(/&amp;/g, '&')
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `${STORE}${raw}`
  if (raw.startsWith('http')) return raw
  return null
}

const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf)$/i

/**
 * Only mirror assets belonging to the store or its CDN.
 *
 * The extension test is what keeps this from crawling the whole shop: `href`
 * appears on every navigation link, and following those would fetch the entire
 * catalogue and collide directory names against file names. Page links are left
 * pointing at their original paths — a screenshot never follows them.
 */
function mirrorable(url) {
  try {
    const u = new URL(url)
    const sameOrigin =
      u.host === HOST || u.host.endsWith('cdn.shopify.com') || u.host === 'fonts.shopifycdn.com'
    return sameOrigin && ASSET_EXT.test(u.pathname)
  } catch {
    return false
  }
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; amiriani-visual-reference/1.0)',
      'Accept-Language': 'en',
      Cookie: `localization=${MARKET}`,
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function store(relPath, body) {
  const file = join(OUT, relPath)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, body)
}

async function mirror() {
  const assets = new Set()
  let fonts = 0

  for (const path of PAGES) {
    process.stdout.write(`  ${path} ... `)
    let html
    try {
      html = (await get(STORE + path)).toString('utf8')
    } catch (error) {
      console.log(`FAILED (${error.message})`)
      continue
    }

    // Rewrite every reference to a local path, collecting what to fetch.
    const rewrite = (raw) => {
      const url = absolute(raw)
      if (!url || !mirrorable(url)) return null
      assets.add(url)
      return assetPath(url)
    }

    html = html.replace(/\b(src|href)=(["'])([^"']+)\2/g, (match, attr, quote, raw) => {
      const local = rewrite(raw)
      return local ? `${attr}=${quote}${local}${quote}` : match
    })

    html = html.replace(/srcset=(["'])([\s\S]*?)\1/g, (match, quote, value) => {
      const parts = value
        .split(',')
        .map((candidate) => candidate.trim())
        .filter(Boolean)
        .map((candidate) => {
          const [url, ...rest] = candidate.split(/\s+/)
          const local = rewrite(url)
          return local ? [local, ...rest].join(' ') : null
        })
        .filter(Boolean)
      return parts.length ? `srcset=${quote}${parts.join(', ')}${quote}` : match
    })

    // url(...) inside inline <style> blocks — Dawn puts hero images there.
    html = html.replace(/url\((["']?)([^)"']+)\1\)/g, (match, quote, raw) => {
      const local = rewrite(raw)
      return local ? `url(${quote}${local}${quote})` : match
    })

    await store(path === '/' ? '/index.html' : `${path}/index.html`, html)
    console.log('ok')
  }

  // Stylesheets reference fonts and background images of their own.
  const queue = [...assets]
  const seen = new Set()
  let stored = 0
  let failed = 0

  while (queue.length > 0) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)

    let body
    try {
      body = await get(url)
    } catch {
      failed += 1
      continue
    }

    const local = assetPath(url)
    if (local.endsWith('.css')) {
      // Follow one level into the CSS so @font-face resolves locally.
      let css = body.toString('utf8')
      css = css.replace(/url\((["']?)([^)"']+)\1\)/g, (match, quote, raw) => {
        const target = absolute(raw)
        if (!target || !mirrorable(target)) return match
        if (!seen.has(target)) queue.push(target)
        return `url(${quote}${assetPath(target)}${quote})`
      })
      body = Buffer.from(css, 'utf8')
    }

    if (/\.(woff2?|ttf|otf)$/.test(local)) fonts += 1
    await store(local, body)
    stored += 1
  }

  console.log(`\n  ${stored} asset(s) stored, ${fonts} font file(s), ${failed} unavailable`)
  if (fonts === 0) {
    console.log(
      '  WARNING: no fonts were mirrored. Text metrics will be measured against\n' +
        '  fallback fonts, and the comparison will report differences that are not real.',
    )
  }
}

function serve() {
  createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const candidates = path.startsWith('/_mirror/')
      ? [path]
      : [path === '/' ? '/index.html' : `${path}/index.html`, path]

    for (const candidate of candidates) {
      try {
        const body = await readFile(join(OUT, candidate))
        res.writeHead(200, {
          'Content-Type': MIME[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
          // The mirrored pages are served from a different origin than they
          // were written for; fonts need this or the browser refuses them.
          'Access-Control-Allow-Origin': '*',
        })
        res.end(body)
        return
      } catch {
        // try the next candidate
      }
    }
    res.writeHead(404).end('not mirrored')
  }).listen(PORT, '127.0.0.1', () => {
    console.log(`\nReference mirror on http://127.0.0.1:${PORT}`)
    console.log(`Run:  REF_BASE=http://127.0.0.1:${PORT} npm run compare`)
  })
}

if (!SERVE_ONLY) {
  console.log(`Mirroring ${STORE} (market ${MARKET}) into ${OUT}\n`)
  await mirror()
}
serve()
