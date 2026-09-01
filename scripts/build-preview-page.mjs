/**
 * Packs the static snapshot into one browsable HTML file.
 *
 *   node scripts/snapshot-static.mjs && node scripts/build-preview-page.mjs
 *
 * Every page of the storefront, its stylesheets and its photographs go into a
 * single document with a small client-side router, so the whole store can be
 * clicked through from one URL with nothing behind it — no server, no
 * database, no asset host. That is what makes it publishable as an artifact.
 *
 * What survives: all markup, all CSS, all images, every link between pages,
 * and the interactions that are pure DOM — the mobile drawer, the search
 * panel, size selection, gallery thumbnails. What does not: anything that
 * talks to the server. Adding to the cart, checkout, accounts and the admin
 * need the running application, and say so when clicked.
 *
 *   OUT_FILE   default .devstack/preview.html
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const SRC = process.env.SNAPSHOT_DIR ?? '.devstack/static'
const OUT = process.env.OUT_FILE ?? '.devstack/preview.html'

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** Human labels for the router's page list, in the order a visitor would meet them. */
const ORDER = [
  ['/', 'Home'],
  ['/collections/all/', 'Essentials'],
  ['/about/', 'About'],
  ['/contact/', 'Contact'],
  ['/cart/', 'Cart'],
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

function routeOf(file) {
  const rel = relative(SRC, file).split('\\').join('/')
  if (rel === 'index.html') return '/'
  return `/${rel.replace(/index\.html$/, '')}`
}

async function main() {
  const files = await walk(SRC)

  // ------------------------------------------------------------------ assets
  const assets = new Map()
  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!MIME[ext]) continue
    const body = await readFile(file)
    assets.set(`/${relative(SRC, file).split('\\').join('/')}`,
      `data:${MIME[ext]};base64,${body.toString('base64')}`)
  }

  // ---------------------------------------------------------------------- css
  let css = ''
  for (const file of files.filter((f) => f.endsWith('.css'))) {
    css += await readFile(file, 'utf8')
  }
  // Stylesheet url(...) references point at fonts and sprites that are now
  // data URIs under the same paths.
  // Stylesheets address these relatively (../media/x.woff2); resolve against
  // the chunk directory the browser would have used.
  const CSS_DIR = '/_next/static/chunks/'
  css = css.replace(/url\((["']?)([^)"']+)\1\)/g, (match, quote, ref) => {
    if (ref.startsWith('data:')) return match
    const path = ref.startsWith('/') ? ref : new URL(ref, `http://x${CSS_DIR}`).pathname
    return assets.has(path) ? `url(${quote}${assets.get(path)}${quote})` : match
  })

  // -------------------------------------------------------------------- pages
  const pages = {}
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    let html = await readFile(file, 'utf8')

    // The Next runtime cannot hydrate inside the router, and its payload is
    // most of the file's weight; the interactions it drove are reimplemented
    // below in a few lines.
    html = html.replace(/<script[\s\S]*?<\/script>/g, '')

    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'AMIRIANI'
    /*
     * next/font declares its faces against CSS variables and puts the class
     * that defines them on <html>. Dropping that class is why the whole store
     * fell back to Times: the variables the stylesheets reference resolved to
     * nothing. Carry it across and set it on the document at render time.
     */
    const rootClass = html.match(/<html[^>]*class="([^"]*)"/)?.[1] ?? ''
    let body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? html

    for (const [path, uri] of assets) body = body.split(path).join(uri)

    pages[routeOf(file)] = { title: title.trim(), body, rootClass }
  }

  const routes = Object.keys(pages).sort()
  const nav = ORDER.filter(([route]) => pages[route])

  const html = `<title>AMIRIANI Storefront Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400&family=Inter:wght@300;400;500&display=swap">
<style>${css}</style>
<style>
  /* The preview's own chrome — everything above is the store's. */
  #preview-bar {
    position: fixed; inset: auto 0 0 0; z-index: 9999;
    display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
    padding: 10px 14px;
    background: #111; color: #f4efe6;
    font: 12px/1.5 Inter, system-ui, sans-serif;
    box-shadow: 0 -1px 0 rgba(255,255,255,0.14);
  }
  #preview-bar b { font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; opacity: 0.65; }
  #preview-bar a {
    color: #f4efe6; text-decoration: none; padding: 3px 9px;
    border: 1px solid rgba(255,255,255,0.28); border-radius: 2px;
  }
  #preview-bar a[aria-current="page"] { background: #f4efe6; color: #111; border-color: #f4efe6; }
  #preview-bar a:focus-visible { outline: 2px solid #f4efe6; outline-offset: 2px; }
  #preview-bar .spacer { flex: 1 1 auto; }
  #preview-bar .note { opacity: 0.6; }
  body { padding-bottom: 58px; }

  /*
   * The store lays <body> out as a grid — header group, announcement bar,
   * main, footer group. Wrapping its markup in a container of my own made
   * those four a grid of one item and pushed the page 2,000px down the
   * screen. display:contents lifts the wrapper out of layout so the
   * sections are body's grid items again, exactly as they are on the real
   * site.
   */
  #preview-root { display: contents; }
  #preview-toast {
    position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%);
    z-index: 10000; max-width: min(30rem, calc(100vw - 32px));
    background: #111; color: #f4efe6; padding: 12px 16px;
    font: 13px/1.5 Inter, system-ui, sans-serif;
  }
  #preview-toast[hidden] { display: none !important; }

  /*
   * Dawn parks every reveal-on-scroll section at opacity .01 and lets an
   * IntersectionObserver fade it in. That observer is part of the runtime this
   * preview strips, so without this the store renders as an empty page below
   * the header. Reveal everything at rest instead — which is what a visitor
   * sees a moment after each section scrolls in anyway.
   */
  .scroll-trigger.animate--fade-in,
  .scroll-trigger.animate--slide-in,
  .scroll-trigger.animate--slide-in [data-cascade],
  [data-cascade] {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
</style>

<div id="preview-root"></div>

<nav id="preview-bar" aria-label="Preview navigation">
  <b>Static preview</b>
  ${nav.map(([route, label]) => `<a href="${route}" data-route="${route}">${label}</a>`).join('\n  ')}
  <span class="spacer"></span>
  <span class="note">Cart and checkout need the live server</span>
</nav>

<div id="preview-toast" hidden role="status"></div>

<script id="preview-pages" type="application/json">${JSON.stringify(pages).replace(/</g, '\\u003c')}</script>
<script>
(function () {
  const pages = JSON.parse(document.getElementById('preview-pages').textContent)
  const root = document.getElementById('preview-root')
  const toast = document.getElementById('preview-toast')
  const bar = document.getElementById('preview-bar')
  const NEEDS_SERVER = /^\\/(checkout|account|admin|api|needs-a-server)(\\/|$)/

  let toastTimer
  function say(message) {
    toast.textContent = message
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.hidden = true }, 3200)
  }

  function normalise(route) {
    if (!route || route === '/') return '/'
    return route.endsWith('/') ? route : route + '/'
  }

  function render(route) {
    const page = pages[route] || pages[normalise(route)]
    if (!page) { say('That page is not part of this preview.'); return false }
    root.innerHTML = page.body
    // Titles arrive entity-escaped (the file is ASCII-only); innerHTML decodes
    // them, whereas assigning to document.title would show the entity.
    const decoder = document.createElement('textarea')
    decoder.innerHTML = page.title
    document.title = decoder.value
    if (page.rootClass) document.documentElement.className = page.rootClass
    for (const link of bar.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === route) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
    window.scrollTo(0, 0)
    wire()
    return true
  }

  /*
   * The store's own JavaScript is stripped, so the handful of interactions a
   * visitor will reach for are reimplemented here against the same markup and
   * the same classes the stylesheets already target.
   */
  function wire() {
    // Mobile menu drawer: Dawn drives it from menu-opening on the <details>.
    const drawer = root.querySelector('.menu-drawer-container')
    const summary = drawer && drawer.querySelector('summary')
    if (drawer && summary) {
      summary.addEventListener('click', (event) => {
        event.preventDefault()
        const open = drawer.classList.toggle('menu-opening')
        drawer.open = open
      })
    }

    // Search panel, same mechanism.
    for (const modal of root.querySelectorAll('details-modal details')) {
      const toggle = modal.querySelector('summary')
      if (!toggle) continue
      toggle.addEventListener('click', (event) => {
        event.preventDefault()
        modal.open = !modal.open
      })
    }

    // Size selection is a radio group; reflect the choice and the price.
    for (const input of root.querySelectorAll('.product-form__input--pill input[type=radio]')) {
      input.addEventListener('change', () => {})
    }

    // Gallery thumbnails swap which slide is active.
    const items = [...root.querySelectorAll('.product__media-item')]
    root.querySelectorAll('.thumbnail-list__item button').forEach((button, index) => {
      button.addEventListener('click', (event) => {
        event.preventDefault()
        items.forEach((item, i) => item.classList.toggle('is-active', i === index))
        root.querySelectorAll('.thumbnail-list__item').forEach((li, i) =>
          li.classList.toggle('thumbnail-list_item--variant', i === index))
      })
    })
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a')
    if (!link) return
    const href = link.getAttribute('href') || ''
    if (!href.startsWith('/') || href.startsWith('//')) return

    event.preventDefault()
    const route = normalise(href.split('?')[0].split('#')[0])

    if (NEEDS_SERVER.test(route)) {
      say('The cart, checkout and account pages read and write at request time, so they are not part of this static preview.')
      return
    }
    if (render(route)) history.pushState({}, '', '#' + route)
  })

  document.addEventListener('submit', (event) => {
    event.preventDefault()
    say('Forms need the live application; this preview is a static copy.')
  })

  window.addEventListener('popstate', () => {
    render(normalise(location.hash.slice(1) || '/'))
  })

  render(normalise(location.hash.slice(1) || '/'))
})()
</script>
`

  /*
   * Written as UTF-8 and left that way. Escaping non-ASCII to HTML entities
   * looks safer but breaks the stylesheets: Dawn draws the footer's separators
   * with `content: "\u00b7"`, and CSS does not decode HTML entities, so the
   * escape renders the entity itself. The published page declares UTF-8; a
   * copy opened from disk needs to be served with that charset.
   */
  await writeFile(OUT, html, 'utf8')
  console.log(`${OUT} — ${routes.length} pages, ${assets.size} assets, ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
