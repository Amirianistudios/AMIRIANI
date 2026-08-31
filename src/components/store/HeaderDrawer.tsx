'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconAccount, IconClose, IconHamburger } from '@/components/store/Icons'
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
}: {
  navigation: NavigationItemRow[]
  currentPath: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('overflow-hidden-tablet')

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('overflow-hidden-tablet')
    }
  }, [open])

  // Close when the route changes.
  useEffect(() => {
    setOpen(false)
  }, [currentPath])

  return (
    <header-drawer data-breakpoint="tablet">
      <details
        className={`menu-drawer-container${open ? ' menu-opening' : ''}`}
        open={open}
      >
        <summary
          className="header__icon header__icon--menu header__icon--summary link focus-inset"
          aria-label={open ? 'Close menu' : 'Menu'}
          aria-expanded={open}
          onClick={(event) => {
            // The drawer is React-controlled, so stop the native toggle.
            event.preventDefault()
            setOpen((value) => !value)
          }}
        >
          <span>
            {open ? (
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
                  <span className="svg-wrapper">
                    <IconAccount className="icon icon-account" />
                  </span>
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </details>
    </header-drawer>
  )
}
