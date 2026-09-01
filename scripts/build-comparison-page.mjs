/**
 * Builds a single self-contained HTML page putting every screenshot of the
 * rebuild next to the same page on the reference storefront.
 *
 *   node scripts/screenshot-pages.mjs && node scripts/build-comparison-page.mjs
 *
 * The measuring harness (compare-visual.mjs) reports numbers; this is for
 * looking. Images are downscaled and re-encoded to WebP, then embedded as data
 * URIs so the result is one file that opens anywhere with no server, no asset
 * directory and no network.
 */

import sharp from 'sharp'
import { readdir, writeFile } from 'node:fs/promises'

const SRC = process.env.SHOT_DIR ?? 'screenshots'
const OUT = process.env.OUT_FILE ?? '.devstack/comparison.html'

/** Notes are written by hand: a screenshot cannot say whether a gap is intended. */
const PAGES = [
  {
    id: 'home',
    name: 'Home',
    ref: '/',
    next: '/',
    note: 'Hero, heading, featured collection and the "View all" button all match. The footer is 24–50px shorter because the reference carries a thirteenth payment badge — Shop Pay — which is deliberately absent here.',
  },
  {
    id: 'collection',
    name: 'Collection',
    ref: '/collections/all',
    next: '/collections/all',
    note: 'Nine products in the same order, same grid, same white ground behind the cards.',
  },
  {
    id: 'product',
    name: 'Product — Tee',
    ref: '/products/oversized-high-neck-t-shirt-unisex-fit',
    next: '/products/oversized-high-neck-t-shirt-unisex-fit',
    note: '"You may also like" shows four products here and one on the reference: Shopify picks those from behavioural data we do not have, so the rebuild shows others from the same collection.',
  },
  {
    id: 'product-hoodie',
    name: 'Product — Hoodie',
    ref: '/products/oversized-hoodie-unisex-fit',
    next: '/products/oversized-hoodie-unisex-fit',
    note: 'A second product page, to confirm the template holds for a different image count and price.',
  },
  {
    id: 'cart',
    name: 'Cart (empty)',
    ref: '/cart',
    next: '/cart',
    note: 'Centred empty state with the "Have an account?" prompt, on a white ground. The reference footer reads "Powered by Shopify"; this one does not.',
  },
  {
    id: 'search',
    name: 'Search',
    ref: '/search?q=tee',
    next: '/search?q=tee',
    note: 'Results for the same query.',
  },
  {
    id: 'contact',
    name: 'Contact',
    ref: '/pages/contact',
    next: '/contact',
    note: 'The URL changes shape — /pages/contact redirects permanently to /contact, so old links keep working.',
  },
  {
    id: 'about',
    name: 'About',
    ref: '/blogs/news',
    next: '/about',
    note: 'The reference serves its About page from the blog. /blogs/news redirects here.',
  },
  {
    id: 'policy',
    name: 'Policy',
    ref: '/policies/refund-policy',
    next: '/policies/refund-policy',
    note: 'All six policy pages use this template; the refund policy stands for the set.',
  },
]

async function encode(file, width) {
  return (
    await sharp(`${SRC}/${file}`)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer()
  ).toString('base64')
}

async function main() {
  const have = new Set(await readdir(SRC))
  const shots = {}

  for (const page of PAGES) {
    for (const viewport of ['desktop', 'mobile']) {
      for (const side of ['ref', 'new']) {
        const file = `${side}-${page.id}-${viewport}.png`
        if (!have.has(file)) continue
        shots[`${side}-${page.id}-${viewport}`] = await encode(
          file,
          viewport === 'mobile' ? 390 : 900,
        )
      }
    }
  }

  const img = (key, alt) =>
    shots[key]
      ? `<img src="data:image/webp;base64,${shots[key]}" alt="${alt}" loading="lazy">`
      : `<p class="missing">Not captured</p>`

  const sections = PAGES.map((page) => `
      <section class="page" id="${page.id}">
        <header class="page__head">
          <h2>${page.name}</h2>
          <p class="paths"><span>${page.ref}</span><span class="arrow" aria-hidden="true">→</span><span>${page.next}</span></p>
        </header>
        <p class="note">${page.note}</p>
        ${['desktop', 'mobile'].map((viewport) => `
        <div class="pair" data-viewport="${viewport}">
          <figure class="shot">
            <figcaption><span class="tag tag--ref">Reference</span> Shopify</figcaption>
            <div class="frame frame--${viewport}">${img(`ref-${page.id}-${viewport}`, `${page.name} on the reference store, ${viewport}`)}</div>
          </figure>
          <figure class="shot">
            <figcaption><span class="tag tag--new">Rebuild</span> Next.js + Supabase</figcaption>
            <div class="frame frame--${viewport}">${img(`new-${page.id}-${viewport}`, `${page.name} on the rebuild, ${viewport}`)}</div>
          </figure>
        </div>`).join('')}
      </section>`).join('')

  const html = `<title>AMIRIANI Side by Side</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap">
<style>
  /* The store's own palette: its cream body, its near-black foreground, its
     section white. The neutrals are warmed toward the cream rather than grey. */
  :root {
    --ground: #fbf7ef;
    --paper: #ffffff;
    --ink: #111111;
    --muted: #6f6558;
    --line: #e6dfd2;
    --ref: #8a7f6d;
    --new: #4a6b57;
    --serif: 'Libre Baskerville', Georgia, 'Times New Roman', serif;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #14120f;
      --paper: #1c1a16;
      --ink: #f2ede3;
      --muted: #a1978a;
      --line: #2e2a23;
      --ref: #a49484;
      --new: #7ea88c;
    }
  }
  :root[data-theme="dark"] {
    --ground: #14120f;
    --paper: #1c1a16;
    --ink: #f2ede3;
    --muted: #a1978a;
    --line: #2e2a23;
    --ref: #a49484;
    --new: #7ea88c;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px 96px; }

  header.masthead { padding: 64px 0 32px; border-bottom: 1px solid var(--line); }
  .eyebrow {
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--muted); margin: 0 0 14px;
  }
  h1 {
    font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 4.5vw, 46px);
    line-height: 1.15; margin: 0 0 16px; text-wrap: balance;
  }
  .lede { max-width: 62ch; color: var(--muted); margin: 0; }

  .summary { display: grid; gap: 14px; margin: 32px 0 0; padding: 0; list-style: none; }
  @media (min-width: 760px) { .summary { grid-template-columns: repeat(2, 1fr); } }
  .summary li {
    background: var(--paper); border: 1px solid var(--line); padding: 16px 18px;
    display: flex; gap: 12px; align-items: flex-start;
  }
  .summary b { font-weight: 600; }
  .summary .k {
    font-family: var(--serif); font-size: 13px; color: var(--muted);
    min-width: 1.4em; padding-top: 1px;
  }

  .controls {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 14px 0; margin: 40px 0 0;
    background: var(--ground); border-bottom: 1px solid var(--line);
  }
  .controls span.label {
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--muted); margin-right: 4px;
  }
  button.toggle {
    font: inherit; font-size: 13px; cursor: pointer;
    background: var(--paper); color: var(--ink);
    border: 1px solid var(--line); padding: 6px 14px;
  }
  button.toggle[aria-pressed="true"] { background: var(--ink); color: var(--ground); border-color: var(--ink); }
  button.toggle:focus-visible { outline: 2px solid var(--new); outline-offset: 2px; }

  section.page { padding-top: 56px; }
  .page__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
  .page__head h2 { font-family: var(--serif); font-weight: 400; font-size: 24px; margin: 0; }
  .paths {
    margin: 0; font-size: 12px; color: var(--muted);
    display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap;
  }
  .paths .arrow { opacity: 0.55; }
  .note { max-width: 74ch; color: var(--muted); margin: 10px 0 22px; font-size: 14px; }

  .pair { display: grid; gap: 20px; }
  @media (min-width: 860px) { .pair { grid-template-columns: 1fr 1fr; } }
  .pair[hidden] { display: none; }

  figure.shot { margin: 0; display: flex; flex-direction: column; gap: 8px; }
  figcaption {
    font-size: 12px; color: var(--muted);
    display: flex; align-items: center; gap: 8px;
  }
  .tag {
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 7px; color: var(--paper);
  }
  .tag--ref { background: var(--ref); }
  .tag--new { background: var(--new); }

  /* The screenshots are whole pages and very tall; each scrolls in its own
     frame so a pair stays side by side and the page itself never grows to
     thousands of pixels. */
  .frame {
    background: var(--paper); border: 1px solid var(--line);
    overflow: auto; max-height: 70vh;
  }
  .frame--mobile { max-height: 78vh; }
  .frame img { display: block; width: 100%; height: auto; }
  .missing { padding: 24px; color: var(--muted); margin: 0; }

  footer.foot {
    margin-top: 72px; padding-top: 24px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 13px;
  }
  @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Visual verification</p>
    <h1>AMIRIANI, side by side</h1>
    <p class="lede">
      Every page of the rebuilt storefront photographed next to the same page on
      the Shopify store it replaces, at 1440px and at 390px. Both sides were shot
      in the same browser, with the same fonts loaded and the same scroll
      applied, so what you see is a like-for-like comparison rather than a
      description of one.
    </p>

    <ul class="summary">
      <li><span class="k">1</span><span><b>Text colour.</b> Every heading and body line on the hero, featured collection, product page and footer was mid-grey; the reference is near-black. Two colour schemes had been merged into one.</span></li>
      <li><span class="k">2</span><span><b>Section grounds.</b> The collection grid, the product page and the cart sat on the cream page background where the reference paints them white edge to edge.</span></li>
      <li><span class="k">3</span><span><b>Mobile gallery.</b> The product photograph was 311px wide against the reference's 343px, and the slide counter was missing entirely.</span></li>
      <li><span class="k">4</span><span><b>Empty cart.</b> Rendered flush left with no account prompt; the reference centres it and offers "Log in to check out faster".</span></li>
    </ul>
  </header>

  <div class="controls">
    <span class="label">Viewport</span>
    <button class="toggle" type="button" data-view="desktop" aria-pressed="true">Desktop — 1440px</button>
    <button class="toggle" type="button" data-view="mobile" aria-pressed="false">Mobile — 390px</button>
  </div>

  ${sections}

  <footer class="foot">
    <p>
      Reference: 7t6swe-yh.myshopify.com, mirrored locally so both sides load in
      the same browser. Rebuild: Next.js reading its catalogue, content,
      navigation and images from Postgres and Supabase Storage.
    </p>
  </footer>
</div>

<script>
  const buttons = document.querySelectorAll('button.toggle')
  const pairs = document.querySelectorAll('.pair')

  function show(view) {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view))
    }
    for (const pair of pairs) {
      pair.hidden = pair.dataset.viewport !== view
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.dataset.view))
  }

  show('desktop')
</script>
`

  await writeFile(OUT, html)
  console.log(`${OUT} — ${Object.keys(shots).length} screenshots, ${(html.length / 1048576).toFixed(1)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
