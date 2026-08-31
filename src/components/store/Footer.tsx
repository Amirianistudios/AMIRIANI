import Link from 'next/link'

import { NewsletterForm } from '@/components/store/NewsletterForm'
import { PaymentIcons } from '@/components/store/PaymentIcons'
import { IconCaret, IconInstagram } from '@/components/store/Icons'

export interface FooterProps {
  shopName: string
  newsletterHeading: string
  instagramUrl: string | null
  localization: { country: string; currency: string; symbol: string }
  policies: { slug: string; title: string }[]
}

/**
 * Site footer.
 *
 * Matches the reference layout: a newsletter block with the social row beside
 * it, then a bottom bar carrying the country selector, payment icons and the
 * copyright/policy line. There are no footer menu columns on the reference
 * store, so none are rendered here.
 */
export function Footer({
  shopName,
  newsletterHeading,
  instagramUrl,
  localization,
  policies,
}: FooterProps) {
  const year = new Date().getFullYear()

  return (
    <div className="shopify-section shopify-section-group-footer-group section-footer">
      <footer className="footer color-scheme-custom gradient section-footer-padding">
        <div className="footer__content-top page-width">
          <div className="footer-block--newsletter">
            <div className="footer-block__newsletter">
              <h2 className="footer-block__heading inline-richtext">
                <strong>{newsletterHeading}</strong>
              </h2>
              <NewsletterForm />
            </div>

            {instagramUrl && (
              <ul className="list-unstyled list-social footer__list-social" role="list">
                <li className="list-social__item">
                  <a
                    href={instagramUrl}
                    className="link list-social__link"
                    target="_blank"
                    rel="noreferrer noopener"
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

        <div className="footer__content-bottom">
          <div className="footer__content-bottom-wrapper page-width">
            <div className="footer__column footer__localization isolate">
              {/*
                `.footer__localization` is a flex row, so the label and the
                selector have to sit inside one wrapper to stack the way they do
                on the reference store. Without it they become sibling flex
                items and render side by side in the wrong order.
              */}
              <div>
                <h2 className="caption-large text-body" id="FooterCountryLabel">
                  Country/region
                </h2>
                <div className="disclosure">
                  <button
                    type="button"
                    className="disclosure__button localization-form__select localization-selector link link--text caption-large"
                    disabled
                    aria-describedby="FooterCountryLabel"
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

            <div className="footer__column footer__column--info">
              <div className="footer__payment">
                <span className="visually-hidden">Payment methods</span>
                <PaymentIcons />
              </div>
            </div>
          </div>

          <div className="footer__content-bottom-wrapper page-width">
            <div className="footer__copyright caption">
              <small className="copyright__content">
                &copy; {year}, <Link href="/">{shopName}</Link>
              </small>
              <ul className="policies list-unstyled">
                {policies.map((policy) => (
                  <li key={policy.slug}>
                    <small className="copyright__content">
                      <Link href={`/policies/${policy.slug}`}>{policy.title}</Link>
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
