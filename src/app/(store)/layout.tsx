import { CartNotification } from '@/components/store/CartNotification'
import { CartProvider } from '@/components/store/CartProvider'
import { Footer } from '@/components/store/Footer'
import { HeaderShell } from '@/components/store/HeaderShell'
import { ScrollAnimations } from '@/components/store/ScrollAnimations'
import { getFooterPolicies, getMainNavigation, getSiteConfig } from '@/lib/site'

/**
 * Storefront shell.
 *
 * The reference layout is a CSS grid on <body> with four rows — header group,
 * announcement bar, main, footer group. That grid lives in theme.css, so the
 * children here map onto those rows in order.
 *
 * The cart is deliberately *not* read here. Doing so would touch cookies and
 * force every page in this group — homepage, collections, products — to render
 * on demand. CartProvider fetches it client-side instead, so those pages stay
 * prerendered and the header count fills in on hydration.
 */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [site, navigation, policies] = await Promise.all([
    getSiteConfig(),
    getMainNavigation(),
    getFooterPolicies(),
  ])

  return (
    <CartProvider>
      <a className="skip-to-content-link button visually-hidden" href="#MainContent">
        Skip to content
      </a>

      <HeaderShell
        navigation={navigation}
        logoUrl={site.logoUrl}
        shopName={site.name}
        localization={site.localization}
      />

      {/*
        The reference store's announcement bar carries no announcements and no
        localisation picker, so it renders as an empty utility bar. Reproduced
        because it still contributes its height to the layout.
      */}
      <div className="shopify-section shopify-section-group-header-group announcement-bar-section">
        <div className="utility-bar color-background-1 gradient">
          <div className="page-width utility-bar__grid">
            <div className="localization-wrapper" />
          </div>
        </div>
      </div>

      <main id="MainContent" className="content-for-layout focus-none" tabIndex={-1}>
        {children}
      </main>

      <Footer
        shopName={site.name}
        newsletterHeading={site.newsletterHeading}
        instagramUrl={site.instagramUrl}
        localization={site.localization}
        policies={policies}
      />

      <CartNotification />
      <ScrollAnimations />
    </CartProvider>
  )
}
