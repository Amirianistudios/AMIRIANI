import 'server-only'

import Stripe from 'stripe'

import { STRIPE_SECRET_KEY } from '@/lib/env'

let instance: Stripe | undefined

/**
 * Lazily constructed Stripe client.
 *
 * Built on first use rather than at module load so that importing this file
 * during a build — or in an environment without the secret — does not throw.
 */
export function stripe(): Stripe {
  instance ??= new Stripe(STRIPE_SECRET_KEY(), {
    // Pinned so a Stripe-side API change cannot alter behaviour silently.
    apiVersion: '2026-08-26.dahlia',
    typescript: true,
    appInfo: { name: 'AMIRIANI Storefront' },
  })
  return instance
}
