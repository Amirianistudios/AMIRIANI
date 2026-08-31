# Vendored Dawn stylesheets

These files are the compiled CSS served by the reference storefront
(`7t6swe-yh.myshopify.com`), which runs Shopify's **Dawn 15.3.0** theme under
the name "Whisper". Dawn is published by Shopify under the MIT licence.

They are vendored rather than reimplemented because they *are* the visual
specification. Re-authoring several thousand lines of layout rules in another
framework would guarantee drift; reusing them means the rebuilt storefront
inherits the reference's exact spacing, breakpoints, grid maths, focus states
and hover behaviour.

## How they are used

`src/app/globals.css` imports them after `src/styles/theme.css`, matching the
order the reference page emits (inline token block first, then `base.css`). The
token values live in `theme.css` and every rule here reads them, so the whole
storefront is retuned from that one file.

Storefront components deliberately use these class names rather than utility
classes. Tailwind is loaded with the `tw` prefix and is used only by `/admin`.

## Local modifications

Kept to the minimum, and listed here in full so a re-fetch can be re-patched:

| File | Change | Why |
| --- | --- | --- |
| `base.css` | `--sparkle: url(./sparkle.gif)` → `--sparkle: none` | Dawn's easter-egg asset. It is referenced only by the `animate--hover-3d-lift` / sparkle hover styles, which this theme does not enable (the reference `<body>` carries `animate--hover-default`). Shipping an unused binary to satisfy a dead reference is not worth it, and leaving the reference unresolved breaks the build. |

Nothing else is edited. Files that returned 404 on the reference store
(`component-rte`, `component-loading-spinner`, `component-mobile-menu`,
`component-modal`) are absent because that theme version folded them into
`base.css`.

## Refreshing

If the reference theme is ever updated and these need re-pulling:

```
curl -sS -o base.css \
  "https://7t6swe-yh.myshopify.com/cdn/shop/t/2/assets/base.css"
```

…then re-apply the table above and re-run the visual comparison
(`npm run compare`).
