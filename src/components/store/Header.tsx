import Image from 'next/image'
import Link from 'next/link'

import { HeaderDrawer } from '@/components/store/HeaderDrawer'
import { HeaderSearch } from '@/components/store/HeaderSearch'
import { CartCount } from '@/components/store/CartCount'
import { IconAccount, IconCart, IconCaret } from '@/components/store/Icons'
import type { NavigationItemRow } from '@/types/database'

export interface HeaderProps {
  navigation: NavigationItemRow[]
  logoUrl: string | null
  shopName: string
  currentPath?: string
  localization: { country: string; currency: string; symbol: string }
}

/**
 * Site header.
 *
 * Reproduces the reference store's `header--top-center` layout: logo centred on
 * the first row with the utility icons flanking it, and the inline menu on a
 * second row beneath. Below the tablet breakpoint the menu collapses into a
 * drawer and the logo stays centred (`header--mobile-center`).
 *
 * Class names are Dawn's, because the ported Dawn stylesheets are what lay this
 * out. Renaming them would break the layout.
 */
export function Header({
  navigation,
  logoUrl,
  shopName,
  currentPath = '/',
  localization,
}: HeaderProps) {
  return (
    <div className="shopify-section shopify-section-group-header-group section-header">
      <div className="header-wrapper color-accent-2 gradient">
        <header className="header header--top-center header--mobile-center page-width header--has-menu header--has-social header--has-account header--has-localizations">
          <HeaderDrawer navigation={navigation} currentPath={currentPath} />

          {/*
            Dawn emits the search twice and lets CSS pick one per breakpoint:
            this direct child of <header> takes the `left-icons` grid area on
            desktop, while the copy inside .header__icons below is the one shown
            on mobile. Only ever one is visible, so rendering both is what makes
            the icon appear in the right place at each size.
          */}
          <HeaderSearch />

          <h1 className="header__heading">
            <Link href="/" className="header__heading-link link link--text focus-inset">
              {logoUrl ? (
                <div className="header__heading-logo-wrapper">
                  <Image
                    src={logoUrl}
                    alt={shopName}
                    width={120}
                    height={76}
                    priority
                    sizes="(max-width: 240px) 50vw, 120px"
                    className="header__heading-logo motion-reduce"
                  />
                </div>
              ) : (
                <span className="h2">{shopName}</span>
              )}
            </Link>
          </h1>

          <nav className="header__inline-menu">
            <ul className="list-menu list-menu--inline" role="list">
              {navigation.map((item) => {
                const active = isActive(item.href, currentPath)
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="header__menu-item list-menu__item link link--text focus-inset"
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className={active ? 'header__active-menu-item' : undefined}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="header__icons header__icons--localization header-localization">
            <div className="desktop-localization-wrapper">
              {/*
                The reference store is single-market (Belgium / EUR), so this
                reproduces the selector's appearance without a menu — there is
                no second market to switch to. Kept as a <button> with Dawn's
                `disclosure__button` classes because that is what the ported
                CSS sizes and positions; a <span> picks up different padding.
                `disabled` makes the inertness real rather than cosmetic.
              */}
              <div className="small-hide medium-hide">
                <div className="disclosure">
                  <button
                    type="button"
                    className="disclosure__button localization-form__select localization-selector link link--text caption"
                    disabled
                    aria-label={`Region: ${localization.country}, currency: ${localization.currency}`}
                  >
                    <span>
                      {localization.country} | {localization.currency}{' '}
                      {localization.symbol}
                    </span>
                    <IconCaret className="icon icon-caret" />
                  </button>
                </div>
              </div>
            </div>

            {/* The mobile instance; see the note on the desktop copy above. */}
            <HeaderSearch />

            <Link
              href="/account"
              className="header__icon header__icon--account link focus-inset small-hide"
              aria-label="Log in"
            >
              <IconAccount className="icon icon-account" />
            </Link>

            <Link
              href="/cart"
              className="header__icon header__icon--cart link focus-inset"
              id="cart-icon-bubble"
            >
              <span className="svg-wrapper">
                <IconCart className="icon icon-cart" />
              </span>
              <span className="visually-hidden">Cart</span>
              <CartCount />
            </Link>
          </div>
        </header>
      </div>
    </div>
  )
}

function isActive(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}
