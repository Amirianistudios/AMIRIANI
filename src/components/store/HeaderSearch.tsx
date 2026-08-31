'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { IconClose, IconSearch } from '@/components/store/Icons'

/**
 * Header search.
 *
 * Dawn opens a full-width modal beneath the header. We keep the same
 * `details-modal` structure and class names so the modal chrome, field styling
 * and focus ring match; submitting navigates to /search.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <details-modal className="header__search">
      <details open={open}>
        <summary
          className="header__icon header__icon--search header__icon--summary link focus-inset modal__toggle"
          aria-haspopup="dialog"
          aria-label="Search"
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault()
            setOpen((value) => !value)
          }}
        >
          <span>
            <span className="svg-wrapper">
              {open ? (
                <IconClose className="icon icon-close" />
              ) : (
                <IconSearch className="icon icon-search" />
              )}
            </span>
          </span>
        </summary>

        <div className="search-modal modal__content gradient" role="dialog" aria-modal="true" aria-label="Search">
          <div className="modal-overlay" />
          <div
            className="search-modal__content search-modal__content-bottom"
            tabIndex={-1}
          >
            <form
              action="/search"
              method="get"
              role="search"
              className="search search-modal__form"
              onSubmit={(event) => {
                event.preventDefault()
                const q = term.trim()
                if (!q) return
                setOpen(false)
                router.push(`/search?q=${encodeURIComponent(q)}`)
              }}
            >
              <div className="field">
                <input
                  ref={inputRef}
                  className="search__input field__input"
                  id="Search-In-Modal"
                  type="search"
                  name="q"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search"
                  autoComplete="off"
                  spellCheck={false}
                />
                <label className="field__label" htmlFor="Search-In-Modal">
                  Search
                </label>
                <button
                  type="reset"
                  className={`reset__button field__button${term ? '' : ' hidden'}`}
                  aria-label="Clear search term"
                  onClick={() => setTerm('')}
                >
                  <span className="svg-wrapper">
                    <IconClose className="icon icon-close" />
                  </span>
                </button>
                <button className="search__button field__button" aria-label="Search">
                  <span className="svg-wrapper">
                    <IconSearch className="icon icon-search" />
                  </span>
                </button>
              </div>
            </form>

            <button
              type="button"
              className="search-modal__close-button modal__close-button link link--text focus-inset"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <span className="svg-wrapper">
                <IconClose className="icon icon-close" />
              </span>
            </button>
          </div>
        </div>
      </details>
    </details-modal>
  )
}
