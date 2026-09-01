# AMIRIANI

The AMIRIANI storefront, rebuilt as an independent e-commerce application.

```
Before   Customer → Shopify storefront → Shopify database → Shopify checkout
After    Customer → Next.js storefront → Supabase          → Stripe
```

Nothing in the running application talks to Shopify. The Shopify store is used
only as the migration source, by the scripts in `scripts/`.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | Supabase / PostgreSQL with Row Level Security |
| Media | Supabase Storage |
| Auth | Supabase Auth |
| Payments | Stripe Checkout + webhooks |
| Styling | Ported Dawn CSS for the storefront; Tailwind 4 (prefixed `tw:`) for `/admin` |
| Hosting | Vercel-ready |

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

`.env.example` documents every variable. The three that matter most:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` — the last of which is server-only and bypasses RLS.

### Setting up the database

Apply `supabase/migrations/*.sql` in filename order, either with the Supabase
CLI (`supabase db push`) or by pasting each file into the SQL editor in order.
They are written to run cleanly on a fresh project and are the complete
definition of the schema — there is no manual step.

To check them without a Supabase project:

```bash
npm run db:verify        # applies them to a local Postgres and asserts behaviour
```

### Loading the catalogue

```bash
npm run data:extract     # public Shopify storefront -> data/shopify-export.json
npm run data:import      # that file -> Supabase, including images into Storage

# Real inventory, SKUs, barcodes, costs, weights and SEO fields are not public.
# Export your products from Shopify admin and re-run:
SHOPIFY_CSV=./products_export.csv npm run data:import
```

Both are idempotent — re-running updates in place rather than duplicating, so
they can be run repeatedly during the migration window.

### Creating the first admin

Sign up at `/account/register`, then:

```bash
npm run admin:grant you@example.com
```

Admin rights live in the private `admin_users` table. Nothing in the browser can
write to it, so this script is the only way to create the first admin.

## Local development without Docker

`scripts/local-supabase.mjs` puts a Supabase-compatible API in front of a plain
Postgres and PostgREST, so the full stack runs without the Supabase CLI or
Docker. It serves `/rest/v1` (mapping the API key to the `anon` or
`service_role` Postgres role, so RLS behaves exactly as in production) and
`/storage/v1` from `.local-storage/`.

```bash
# 1. Postgres on port 5433 with the schema applied
createdb amiriani_dev
psql amiriani_dev -f scripts/supabase-shim.sql
for f in supabase/migrations/*.sql; do psql amiriani_dev -f "$f"; done

# 2. PostgREST on 3001
PGRST_DB_URI=postgresql://postgres@localhost:5433/amiriani_dev \
PGRST_DB_ANON_ROLE=anon PGRST_SERVER_PORT=3001 \
PGRST_JWT_SECRET=local-development-jwt-secret-at-least-32-chars postgrest

# 3. The Supabase-shaped façade on 54321
npm run dev:supabase

# 4. The app
ALLOW_LOCAL_IMAGE_HOSTS=1 npm run dev
```

Point `.env.local` at `http://127.0.0.1:54321` with `local-anon-key` and
`local-service-key`. `ALLOW_LOCAL_IMAGE_HOSTS=1` relaxes Next's SSRF guard for
images served from a private IP; it is ignored in production builds.

After any migration, tell PostgREST to reload:
`psql amiriani_dev -c "notify pgrst, 'reload schema'"`.

## Project structure

```
src/
  app/
    (store)/            storefront routes — home, collections, products, cart,
                        checkout, account, content pages, policies
    admin/
      (dashboard)/      guarded admin screens
      login/            unguarded, so the guard cannot redirect to itself
      actions.ts        admin server actions; each re-checks authorisation
    api/                cart, checkout, newsletter, contact, Stripe webhook
    auth/callback/      Supabase email confirmation and password reset
  components/
    store/              storefront components, using Dawn's class names
    admin/              admin components, using Tailwind
  lib/
    supabase/           server (RLS), public (cached reads), admin (service role)
    cart/               server-side cart, addressed by an httpOnly cookie token
    stripe/             lazily constructed Stripe client
    catalog.ts          catalogue queries and shaping
    auth.ts             current user, customer, and admin check
    money.ts            integer-cents money and the store's price format
  styles/
    dawn/               vendored Dawn stylesheets (see its README)
    theme.css           design tokens lifted from the reference store
    sections.css        per-section CSS the reference emits inline
supabase/migrations/    complete schema, in filename order
scripts/                extract, import, verify, local harness, admin grant
data/                   the extracted Shopify catalogue
```

## How the visual layer works

The reference storefront runs Shopify's **Dawn 15.3.0** theme. Rather than
re-authoring several thousand lines of layout rules — which would guarantee
drift — its compiled CSS is vendored into `src/styles/dawn/` (Dawn is MIT
licensed) and the components reproduce Dawn's DOM and class names.

Two things about that are easy to miss and account for most of the fidelity:

1. **The design tokens are the contract.** `src/styles/theme.css` holds the
   exact `:root` values the reference emits — colours, the 1.05 font scale, the
   140rem page width, button radii, grid spacing. Every ported rule reads them.

2. **Not all of Dawn's CSS is in its stylesheets.** Dawn emits snippet CSS
   inline, and the theme editor appends the store's own per-section CSS scoped
   to `#shopify-section-<id>`. That is where this store's real typography lives
   — the italic prices, the uppercase product title, the section padding. It is
   transcribed into `src/styles/sections.css`, re-scoped to stable `.section-*`
   classes. Without it the rebuild silently differs.

Tailwind is loaded without its preflight, because that reset would override the
element styles the ported CSS depends on. It is prefixed `tw:` and used only by
`/admin`.

## Security

- **Prices are never trusted from the browser.** `create_order_from_cart` re-reads
  every line price from the database, applies the discount and shipping rule
  server-side, and writes the order in one transaction.
- **Overselling is impossible.** Stock is decremented under a row lock, and the
  database raises rather than clamping if it would go negative. Concurrent
  checkouts serialise on that lock.
- **Orders are idempotent.** A retried checkout reuses the same idempotency key
  and returns the original order, so a double submit cannot double-charge.
- **Only Stripe marks an order paid**, via a signature-verified webhook. Landing
  on the success page proves nothing and changes nothing.
- **RLS is on for every table.** The anon role can read active catalogue content
  and nothing else; customers can read only their own orders and addresses;
  carts and orders are not client-writable at all.
- **Admin status lives in a private table**, checked server-side, never in a JWT
  claim the client could influence. Server Actions re-check it individually,
  since they are reachable as endpoints in their own right.
- **The service-role key is server-only.** `lib/env.ts` throws if it is read in
  the browser, turning a leak into a crash.

## Verification

Static checks:

```bash
npm run typecheck
npm run lint
npm run build
```

Behavioural checks, in rough order of how much they cost to run:

```bash
npm run db:verify         # schema and database-level guarantees
npm run commerce:verify   # inventory under real concurrency
npm run stripe:verify     # webhook signatures, idempotency, restock
npm run flow:verify       # the whole customer journey (needs the app running)
npm run admin:verify      # the admin actually writes (drives a browser)
npm run supabase:verify   # a hosted project, end to end
```

What each one is for:

- **`db:verify`** applies the migrations to a throwaway database and asserts
  that RLS is enabled everywhere, the inventory guard rejects overselling,
  checkout prices server-side and de-duplicates on its idempotency key,
  restocking is idempotent, and the money constraints reject inconsistent
  totals.
- **`commerce:verify`** fires fifteen simultaneous buyers at five units of stock
  and requires exactly five orders, stock landing on zero, and five units in the
  journal — then submits one idempotency key five times at once and requires one
  order. Sequential tests cannot catch overselling; this can.
- **`stripe:verify`** posts real Stripe-signed events at the running app: a
  wrong secret, a malformed header and an hour-old timestamp must all be
  refused, a valid one must mark the order paid, and delivering it twice must
  not move stock twice.
- **`flow:verify`** walks browse → cart → quantity → shipping → checkout →
  webhook → confirmation → account → order history, asserting against Postgres
  rather than against what the page rendered, and then the failure paths:
  tampered prices, draft products, oversold quantities, unserved countries,
  invented shipping rates.
- **`admin:verify`** signs in as a real admin in a real browser and works a
  product through its whole life — create, edit, add variant, reprice, restock,
  upload an image, assign a collection, publish, archive — checking the database
  after every step, and confirms a signed-in non-admin is refused by the server
  rather than merely by a hidden link.
- **`supabase:verify`** points at a hosted project and checks its structure,
  that RLS is enforced through the anon key and not just declared, that checkout
  is not callable by browser roles, and that anonymous storage uploads fail.

### Visual regression

```bash
npm run compare:mirror &    # mirrors the reference store, serves it on :8899
REF_BASE=http://127.0.0.1:8899 npm run compare
```

Screenshots both sites at 375, 430, 768, 1280, 1440 and 1920 and compares the
geometry of key elements numerically. A page that fails to load counts as a
difference, not a match — a comparison that silently passes because it compared
nothing is worse than no comparison.

The mirror exists because a browser cannot always reach the reference store
directly (a proxy, an egress policy, a CI runner), while `fetch` usually can.
Point `REF_BASE` straight at the live store where the browser can reach it.

When running the app locally for a comparison, use `ALLOW_LOCAL_IMAGE_HOSTS=1
npm run dev`: Next refuses to optimise images from a private IP, so against the
local Supabase harness every image silently 500s and the measurements are
meaningless.

## Shipping

Rates are **not** configurable and **not** guessed. They were read off the
reference store's own checkout, one country at a time, and transcribed into
`src/lib/shipping.ts`:

| Zone | Countries | Standard | Above the threshold |
| --- | --- | --- | --- |
| EU | BE NL FR DE AT LU SE DK CZ | €8.56 | €4.12 |
| UK | GB | €8.56 | €3.95 |
| EFTA | CH | €11.15 | €8.60 |

Anywhere else is refused at checkout rather than shipped at a made-up price.
Only the threshold at which the cheaper option unlocks is configurable
(`FREE_SHIPPING_THRESHOLD_CENTS`, default €199.90), because it is the one value
the public API would not reveal exactly.

The browser sends a rate *code*, never a price. `/api/checkout` re-derives the
amount from that code against the server's own view of the cart, so a tampered
response from `/api/shipping-rates` cannot change what is charged.

## Deployment

1. Create the Supabase project and apply the migrations (`npm run supabase:apply`).
2. Verify it (`npm run supabase:verify`) before putting data in it.
3. Import the catalogue (`data:extract`, then `data:import` with your admin CSV
   and `IMAGE_STRATEGY=storage`).
4. Deploy to Vercel with the variables from `.env.example`.
5. Add a Stripe webhook endpoint at `https://<domain>/api/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_failed` and `charge.refunded`, and put its
   signing secret in `STRIPE_WEBHOOK_SECRET`. Test mode and live mode have
   separate endpoints and separate secrets.
6. Grant yourself admin and confirm `/admin` loads.
7. Place a test order end to end before pointing DNS at the new site.

See `docs/MIGRATION.md` for the full thirteen-step cutover checklist, the safest
way to create the first admin, the list of data that still needs a Shopify admin
export, and every remaining Shopify reference in the repository with a decision
attached to it.
