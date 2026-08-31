# Shopify → AMIRIANI cutover

What has moved, what still needs data from Shopify, and the order to do things
in when you switch DNS.

## 1. What was migrated, and from where

Everything came from the public storefront at `7t6swe-yh.myshopify.com` — no
Shopify API credentials were used, so nothing here depends on keeping the
Shopify account open.

| Data | Source | Status |
| --- | --- | --- |
| 9 products, titles, descriptions | `/products.json` | Complete |
| 48 variants, sizes, prices, weights, SKUs | `/products.json` | Complete |
| 30 product images | product CDN → Supabase Storage | Complete |
| Collection "Home page" (`frontpage`) and its manual order | `/collections/…/products.json` | Complete |
| 6 policies (privacy, refund, terms, shipping, legal notice, contact information) | rendered policy pages | Complete |
| About and Contact page content | rendered pages | Complete |
| Navigation (Home, Essentials, About, Contact) | rendered header | Complete |
| Homepage hero image, heading, CTA; featured section copy | rendered homepage | Complete |
| Logo | rendered header → Supabase Storage | Complete |
| Payment badges | rendered footer | Complete, less Shop Pay (see below) |

### A note on prices

The store runs Shopify Markets, and `/products.json` returns **different prices
per market**: a request carrying `Accept-Language: en` returns the international
catalogue (e.g. 119.00) while a Belgian visitor sees 99.95 — which is what the
storefront actually renders. Node's `fetch` sends `Accept-Language: *` by
default, so an unpinned extraction silently captures the wrong prices.

`scripts/extract-shopify.ts` therefore pins the market with a
`localization=BE` cookie (`SHOPIFY_MARKET_COUNTRY`) and, after extracting,
cross-checks the JSON prices against the rendered product pages, failing loudly
on a mismatch. If you sell into another market, change that variable and re-run.

## 2. What still needs a Shopify admin export

These are not exposed publicly. The importer accepts them; it does not invent
them.

| Missing | Consequence today | How to supply it |
| --- | --- | --- |
| **Per-variant inventory counts** — public JSON only says available/unavailable | Every available variant was seeded at 25 units | Export products from Shopify admin (Products → Export → CSV) and re-run `INVENTORY_CSV=./products_export.csv npm run data:import`, or set counts in `/admin` |
| **Cost per item** | `cost_cents` is null, so margin reporting is unavailable | Same CSV; the column is `Cost per item` |
| **Barcodes** | `barcode` is null | Same CSV |
| **Per-product SEO title/description** | Falls back to the product title and description, which is reasonable but not what you wrote | Same CSV, or edit in `/admin` |
| **Existing customer accounts** | The new store starts with no customers | Shopify cannot export password hashes. Customers must re-register; consider emailing them a password-reset invitation at launch |
| **Historical orders** | Not carried over | Export from Shopify admin and keep as records; importing them would produce orders with no payment behind them |

Everything else on the storefront is complete.

## 3. Deliberate differences

Two things are intentionally not reproduced. Both would be inaccurate on an
independent store:

1. **"Powered by Shopify"** is removed from the footer.
2. **The Shop Pay badge** is removed from the payment icons. Shop Pay is a
   Shopify-operated wallet and will not be an available method at checkout;
   showing it would misrepresent what customers can pay with. The other twelve
   badges are unchanged. Once your Stripe methods are confirmed, prune
   `src/components/store/PaymentIcons.tsx` to match what you actually accept.

Beyond those, where the reference store does something unusual it is reproduced
rather than "fixed" — including the empty announcement bar, which still occupies
its height, and the slideshow section that is configured with no slides and so
renders nothing.

The store's own theme CSS contains a few rules targeting class names Dawn never
produces (`.image-banner__heading`, `.product__price`, `.footer__social`,
`.footer__policy`, `.featured-collection .title`). They have no effect on the
reference site either. They are kept verbatim in `src/styles/sections.css` so
the file remains a faithful record; they stay inert because the rebuilt markup
mirrors Dawn's class names.

## 4. Cutover order

Do these in sequence. Steps 1–6 are safe to do while Shopify is still live.

1. **Create the Supabase project** and apply `supabase/migrations/*.sql` in
   filename order.
2. **Import the catalogue**: `npm run data:extract && npm run data:import`.
   Re-run with `INVENTORY_CSV=…` once you have the admin export.
3. **Deploy to Vercel** with the environment from `.env.example`. Use a preview
   domain first.
4. **Configure Stripe**: add the webhook endpoint
   `https://<domain>/api/webhooks/stripe` for `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_failed` and
   `charge.refunded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   Without this, orders are created but never marked paid.
5. **Grant yourself admin**: `npm run admin:grant you@example.com`, then confirm
   `/admin` loads and shows the catalogue.
6. **Place a real end-to-end test order** with a live card, and confirm:
   the order appears in `/admin/orders` as paid, stock decremented, and the
   confirmation page shows the right total. Refund it afterwards and confirm the
   status follows.
7. **Point DNS** at Vercel and set `NEXT_PUBLIC_SITE_URL` to the live origin.
   Re-deploy so sitemap and canonical URLs use it.
8. **Keep Shopify running, read-only, for two weeks.** Do not cancel it until
   you have confirmed order flow and search traffic on the new site.
9. **Submit the new sitemap** (`/sitemap.xml`) in Google Search Console and
   watch for 404s.
10. **Cancel Shopify.**

## 5. URL preservation

Slugs are unchanged, so every product and policy URL carries over exactly:

```
/products/<handle>          unchanged
/policies/<slug>            unchanged
/collections/all            unchanged
```

These change shape, and are handled by permanent redirects in `next.config.ts`:

| Shopify | New |
| --- | --- |
| `/blogs/news`, `/blogs/news/:slug` | `/about` |
| `/pages/about` | `/about` |
| `/pages/contact` | `/contact` |
| `/collections/frontpage` | `/collections/all` |
| `/collections/:collection/products/:slug` | `/products/:slug` |

The same set is also seeded into the `redirects` table for reference. If you add
more later, add them to `next.config.ts` — that is what actually serves them.

Product structured data, OpenGraph tags, canonical URLs, `sitemap.xml` and
`robots.txt` are all generated, so the SEO surface is equivalent to or better
than the Shopify original.

## 6. Rolling back

Nothing about the migration is destructive to Shopify — it was only ever read
from. If you need to roll back before step 10, point DNS back at Shopify. The
Supabase data stays intact for a later attempt.
