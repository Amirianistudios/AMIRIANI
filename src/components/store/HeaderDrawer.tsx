'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconAccount, IconCaret, IconClose, IconHamburger, IconInstagram } from '@/components/store/Icons'
import type { NavigationItemRow } from '@/types/database'

/**
 * Mobile/tablet navigation drawer.
 *
 * Dawn implements this with <details>/<summary> plus a custom element that
 * toggles `menu-opening` on the <details> to drive the slide-in. We keep that
 * exact structure and class placement so component-menu-drawer.css animates it
 * the same way; only the toggling is React state rather than a web component.
 */
export function HeaderDrawer({
  navigation,
  currentPath,
  localization,
  instagramUrl,
}: {
  navigation: NavigationItemRow[]
  currentPath: string
  localization: { country: string; currency: string; symbol: string }
  instagramUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  // Deriving "closed on a new route" during render avoids a setState-in-effect
  // cascade: the drawer simply never renders open for a path it did not open on.
  const [openedOnPath, setOpenedOnPath] = useState(currentPath)
  const isOpen = open && openedOnPath === currentPath

  useEffect(() => {
    if (!isOpen) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('overflow-hidden-tablet')

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('overflow-hidden-tablet')
    }
  }, [isOpen])

  return (
    <header-drawer data-breakpoint="tablet">
      <details
        className={`menu-drawer-container${isOpen ? ' menu-opening' : ''}`}
        open={isOpen}
      >
        <summary
          className="header__icon header__icon--menu header__icon--summary link focus-inset"
          aria-label={isOpen ? 'Close menu' : 'Menu'}
          aria-expanded={isOpen}
          onClick={(event) => {
            // The drawer is React-controlled, so stop the native toggle.
            event.preventDefault()
            setOpenedOnPath(currentPath)
            setOpen(!isOpen)
          }}
        >
          <span>
            {isOpen ? (
              <IconClose className="icon icon-close" />
            ) : (
              <IconHamburger className="icon icon-hamburger" />
            )}
          </span>
        </summary>

        <div className="gradient menu-drawer motion-reduce color-scheme-custom">
          <div className="menu-drawer__inner-container">
            <div className="menu-drawer__navigation-container">
              <nav className="menu-drawer__navigation">
                <ul className="menu-drawer__menu has-submenu list-menu" role="list">
                  {navigation.map((item) => {
                    const active =
                      item.href === '/'
                        ? currentPath === '/'
                        : currentPath.startsWith(item.href)
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={`menu-drawer__menu-item list-menu__item link link--text focus-inset${
                            active ? ' menu-drawer__menu-item--active' : ''
                          }`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>

              <div className="menu-drawer__utility-links">
                <Link
                  href="/account"
                  className="menu-drawer__account link focus-inset h5 medium-hide large-up-hide"
                  onClick={() => setOpen(false)}
                >
                  {/*
                    <account-icon> is load-bearing, not decoration: the rule
                    that sizes this glyph and puts a 1rem gap between it and
                    the word is `.menu-drawer__account account-icon > .svg-wrapper`.
                    Without the element the icon sat flush against "Log in".
                  */}
                  <account-icon>
                    <span className="svg-wrapper">
                      <IconAccount className="icon icon-account" />
                    </span>
                  </account-icon>
                  Log in
                </Link>

                {/* Single-market, so inert — see the note on the header copy. */}
                <div className="menu-drawer__localization header-localization">
                  {/*
                    The <localization-form> element and the inner
                    `.localization-form` are what size this. `localization-form:only-child`
                    sets `display:inline-flex; width:auto`, so the control
                    shrinks to its label; without them the disclosure stretched
                    the full drawer width and pushed the caret to the far edge.
                    A <div> rather than a <form>, because nothing is submitted.
                  */}
                  <localization-form>
                  <div className="localization-form">
                  <div className="disclosure">
                    <button
                      type="button"
                      className="disclosure__button localization-form__select localization-selector link link--text caption-large"
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
                  </localization-form>
                </div>

                {instagramUrl && (
                  <ul className="list list-social list-unstyled" role="list">
                    <li className="list-social__item">
                      <a
                        href={instagramUrl}
                        className="link list-social__link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="svg-wrapper">
                          <IconInstagram className="icon icon-instagram" />
                        </span>
                        <span className="visually-hidden">Instagram</span>
                      </a>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>
    </header-drawer>
  )
}
