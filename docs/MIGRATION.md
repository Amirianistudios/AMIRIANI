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
| **Per-variant inventory counts** — public JSON only says available/unavailable | Every available variant was seeded at 25 units | Export products from Shopify admin (Products → Export → CSV) and re-run `SHOPIFY_CSV=./products_export.csv npm run data:import`, or set counts in `/admin` |
| **Cost per item** | `cost_cents` is null, so margin reporting is unavailable | Same CSV; the column is `Cost per item` |
| **Barcodes** | `barcode` is null | Same CSV |
| **Per-variant weight** | `weight_grams` is null | Same CSV; converted from whatever unit the export uses |
| **Per-product SEO title/description** | Falls back to the product title and description, which is reasonable but not what you wrote | Same CSV, or edit in `/admin` |
| **Existing customer accounts** | The new store starts with no customers | Shopify cannot export password hashes. Customers must re-register; consider emailing them a password-reset invitation at launch |
| **Historical orders** | Not carried over | Export from Shopify admin and keep as records; importing them would produce orders with no payment behind them |

Everything else on the storefront is complete.

### Re-running the import is safe

The importer will not silently overwrite live stock. For any variant the CSV
gives no count for, it leaves `inventory_quantity` exactly as it is, and says so
at the end of the run:

```
Left existing stock untouched on 48 variant(s): this run had no count for them,
     and overwriting would have discarded sales and admin corrections.
```

This matters because the first import seeded placeholder counts. Without that
rule, re-importing after go-live would wipe every sale and every correction made
in the admin. `OVERWRITE_INVENTORY=1` forces the old behaviour; it exists for
resetting a development database and should not be used against production.

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

## 4. Cutover checklist

Do these in sequence. Steps 1–9 are safe to do while Shopify is still live and
serving customers; nothing before step 10 is visible to anyone but you.

**1. Create the Supabase project.** Any region close to your customers; for a
Belgian store, `eu-central-1` or `eu-west-1`. Note the project URL, the
publishable (anon) key, the service role key, and the Postgres connection
string from Project Settings → Database → Connection string → URI.

**2. Apply the schema.**

```bash
DATABASE_URL='postgresql://postgres.<ref>:<password>@…pooler.supabase.com:5432/postgres' \
  npm run supabase:apply
```

Use port **5432**, not 6543 — the transaction pooler cannot run DDL. Each
migration runs in its own transaction and is recorded, so a failure leaves the
schema untouched and a re-run only applies what is new.

**3. Verify the project before putting anything in it.**

```bash
DATABASE_URL='…' \
NEXT_PUBLIC_SUPABASE_URL='https://<ref>.supabase.co' \
NEXT_PUBLIC_SUPABASE_ANON_KEY='…' \
  npm run supabase:verify
```

This checks the tables, that RLS is on **and actually enforced** through the
anon key, foreign keys and their indexes, constraints, the `SECURITY DEFINER`
functions, that `create_order_from_cart` is not callable by browser roles, that
the three storage buckets exist and are public for reads, and that an anonymous
upload is refused. Do not continue past a failure here.

**4. Export your products from Shopify admin.** Products → Export → All
products → Plain CSV file. This is the only source for real inventory counts,
SKUs, barcodes, cost per item, weights and your written SEO fields — none of it
is public.

**5. Import the catalogue.**

```bash
npm run data:extract
IMAGE_STRATEGY=storage SHOPIFY_CSV=./products_export.csv npm run data:import
```

`IMAGE_STRATEGY=storage` downloads every image into Supabase Storage. Confirm
afterwards that `npm run supabase:verify` reports "images live in Supabase
Storage" rather than warning that they are external URLs — until it does, the
store still depends on the Shopify CDN and cannot outlive Shopify.

**6. Deploy to a preview domain** with the environment from `.env.example`. Keep
`NEXT_PUBLIC_SITE_URL` pointed at the preview URL for now.

**7. Configure Stripe in test mode.** Add the webhook endpoint
`https://<preview-domain>/api/webhooks/stripe` subscribed to
`checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_failed` and `charge.refunded`, and put its
signing secret in `STRIPE_WEBHOOK_SECRET`. Without it, orders are created but
never marked paid — the single most consequential thing to get wrong here.

**8. Grant yourself admin.** See "First admin" below. Then confirm `/admin`
loads, shows the catalogue, and that signing in with a non-admin account is
refused.

**9. Run the verification suite against the deployment.**

```bash
APP_URL=https://<preview-domain> npm run flow:verify
APP_URL=https://<preview-domain> npm run admin:verify
npm run commerce:verify
npm run stripe:verify
```

Then place a real order with a Stripe **test** card (4242 4242 4242 4242) and
confirm by eye: it appears in `/admin/orders` as paid, stock went down by the
right amount, and the confirmation page shows the right total. Refund it in
Stripe and confirm the order follows to `refunded`.

**10. Switch Stripe to live keys** and add the live-mode webhook endpoint for
the real domain. Test and live mode have separate endpoints and separate signing
secrets; copying the test secret into production is a silent failure that looks
exactly like working checkout until you check whether orders are paid.

**11. Point DNS** at the deployment, set `NEXT_PUBLIC_SITE_URL` to the live
origin, and redeploy so canonical URLs and the sitemap use it.

**12. Watch it for two weeks with Shopify still running.** Submit
`/sitemap.xml` in Google Search Console, watch the coverage report for 404s, and
confirm orders and search traffic are arriving. Shopify stays up and unchanged
during this window; it is your rollback.

**13. Cancel Shopify** — only once step 12 has actually shown you two weeks of
orders and stable search traffic, and once the Shopify-dependency table below
has no rows left in the "must be removed" column.

### First admin

There is no self-service route to admin, deliberately: `admin_users` is not
writable by anyone through the API, and `is_admin()` reads it with
`SECURITY DEFINER`, so no client can promote itself.

The safest order is:

1. Register normally on the storefront at `/account/register` with the address
   you want to administer from. This creates the auth user with a password only
   you know — no shared or temporary credential is ever created.
2. Promote it from a trusted machine:

   ```bash
   npm run admin:grant you@example.com
   ```

   This needs `SUPABASE_SERVICE_ROLE_KEY`, so it can only be run by someone who
   already holds the project's root credential.
3. Sign in at `/admin/login` and confirm you get in.

Grant further staff the same way, from `/admin` or the same command. If you ever
need to revoke access, delete the row from `admin_users`; the account keeps
working as an ordinary customer account.

Never paste the service role key into a browser, a client component, or an
environment variable prefixed `NEXT_PUBLIC_`. `src/lib/env.ts` throws if it is
read in the browser, which turns a leak into a crash rather than a quiet
exposure — but that is a backstop, not a licence.

## 4a. Remaining Shopify dependencies

Every occurrence of `shopify`, `myshopify`, `cdn.shopify`, `Shop Pay`, `Liquid`
and the Shopify APIs in this repository, classified.

| Where | What it is | Classification |
| --- | --- | --- |
| `src/app/globals.css`, `src/styles/**` — `.shopify-section`, `.shopify-payment-button` etc. | Class names in the vendored Dawn theme CSS. The rebuilt markup uses them because that stylesheet is what lays the storefront out. | **Static copied asset — keep.** Renaming them means re-testing every page for visual drift, for no functional gain. |
| `src/components/store/*.tsx`, `src/app/(store)/**` — `className="shopify-section …"` | The same class names in the markup. | **Static copied asset — keep**, for the same reason. |
| `scripts/extract-shopify.ts` | Reads the reference store's public JSON to produce `data/shopify-export.json`. | **Temporary migration tool.** Never runs in the application. Delete after step 13 if you like; harmless if kept. |
| `scripts/import-to-supabase.ts` | Reads that export plus your admin CSV and writes Supabase. | **Temporary migration tool.** Same. |
| `scripts/mirror-reference.mjs`, `scripts/compare-visual.mjs` | Fetch the reference storefront for the visual comparison. | **Temporary migration tool.** Keep while you still want to diff against the old site. |
| `next.config.ts` — `cdn.shopify.com` and `*.myshopify.com` in `images.remotePatterns` | Lets a partially migrated catalogue keep rendering while some images are still on `external_url`. | **Must be removed at cutover.** Once `npm run supabase:verify` reports every image in Storage, delete both patterns. Leaving them is not a security hole, but it lets a future import quietly reintroduce a Shopify dependency without anyone noticing. |
| `next.config.ts` — `/blogs/news`, `/collections/frontpage` redirects | Preserve inbound links to Shopify-shaped URLs. | **Keep permanently.** These are what stop old search results and other people's links from 404ing. |
| `src/lib/shipping.ts` — comment citing `/cart/shipping_rates.json` | Records where the rate table came from. | **Documentation — keep.** It is the provenance of numbers that charge customers money. |
| `src/components/store/PaymentIcons.tsx` — comment about Shop Pay | Explains why Shop Pay is absent. | **Documentation — keep.** |
| `.env.example`, `README.md`, this file | Instructions referring to Shopify. | **Documentation — keep** until the migration is finished, then prune as you like. |
| `data/shopify-export.json` | The extracted catalogue snapshot. | **Temporary migration data.** Keep until step 13, as a record of what was imported. |

There is **no runtime dependency on Shopify**: no application route, server
component or client component contacts a Shopify domain, and after step 5 no
page requests an asset from `cdn.shopify.com`. What remains is class names,
one-off tooling, and prose.

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
