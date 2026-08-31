/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations. Once a Supabase project is
 * linked, regenerate with:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * and this file becomes generated output. Until then, keep it in step with the
 * migrations by hand — the app is typed against it.
 */

export type ProductStatus = 'draft' | 'active' | 'archived'
export type CollectionStatus = 'draft' | 'active' | 'archived'
export type OrderStatus = 'pending' | 'open' | 'cancelled' | 'archived'
export type PaymentStatus =
  | 'unpaid'
  | 'authorized'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'
export type FulfilmentStatus =
  | 'unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'delivered'
  | 'cancelled'
export type DiscountKind = 'percentage' | 'fixed_amount' | 'free_shipping'
export type InventoryReason =
  | 'import'
  | 'manual'
  | 'sale'
  | 'restock'
  | 'cancellation'
  | 'reservation'
  | 'release'
  | 'correction'

export type ProductRow = {
  id: string
  slug: string
  title: string
  description_html: string | null
  short_description: string | null
  status: ProductStatus
  vendor: string | null
  product_type: string | null
  category: string | null
  sku: string | null
  barcode: string | null
  base_price_cents: number | null
  compare_at_cents: number | null
  cost_cents: number | null
  currency: string
  taxable: boolean
  tax_included: boolean
  featured: boolean
  position: number
  tags: string[]
  seo_title: string | null
  seo_description: string | null
  external_source: string | null
  external_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ProductVariantRow = {
  id: string
  product_id: string
  title: string
  sku: string | null
  barcode: string | null
  size: string | null
  color: string | null
  material: string | null
  price_cents: number
  compare_at_cents: number | null
  cost_cents: number | null
  weight_grams: number | null
  position: number
  active: boolean
  inventory_quantity: number
  inventory_reserved: number
  inventory_tracked: boolean
  allow_backorder: boolean
  external_source: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export type ProductImageRow = {
  id: string
  product_id: string
  variant_id: string | null
  storage_path: string | null
  external_url: string | null
  alt: string | null
  width: number | null
  height: number | null
  position: number
  is_primary: boolean
  created_at: string
}

export type CollectionRow = {
  id: string
  slug: string
  title: string
  description_html: string | null
  image_path: string | null
  image_url: string | null
  status: CollectionStatus
  position: number
  sort_order: string
  seo_title: string | null
  seo_description: string | null
  external_source: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export type CollectionProductRow = {
  collection_id: string
  product_id: string
  position: number
  created_at: string
}

export type CustomerRow = {
  id: string
  user_id: string | null
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  accepts_marketing: boolean
  notes: string | null
  external_source: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export type CustomerAddressRow = {
  id: string
  customer_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  address1: string
  address2: string | null
  city: string
  region: string | null
  postcode: string
  country_code: string
  phone: string | null
  default_shipping: boolean
  default_billing: boolean
  created_at: string
  updated_at: string
}

export type CartRow = {
  id: string
  token: string
  customer_id: string | null
  currency: string
  discount_code: string | null
  note: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type CartItemRow = {
  id: string
  cart_id: string
  variant_id: string
  quantity: number
  created_at: string
  updated_at: string
}

export type OrderRow = {
  id: string
  order_number: string
  customer_id: string | null
  email: string
  phone: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  fulfilment_status: FulfilmentStatus
  currency: string
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  discount_code: string | null
  shipping_address: Address | null
  billing_address: Address | null
  note: string | null
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  idempotency_key: string | null
  placed_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type OrderItemRow = {
  id: string
  order_id: string
  variant_id: string | null
  product_id: string | null
  product_title: string
  variant_title: string
  product_slug: string | null
  sku: string | null
  image_url: string | null
  unit_price_cents: number
  quantity: number
  subtotal_cents: number
  snapshot: Record<string, unknown>
  created_at: string
}

export type DiscountCodeRow = {
  id: string
  code: string
  kind: DiscountKind
  value: number
  minimum_subtotal_cents: number
  usage_limit: number | null
  usage_limit_per_customer: number | null
  times_used: number
  starts_at: string
  ends_at: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type InventoryMovementRow = {
  id: string
  variant_id: string
  delta: number
  reason: InventoryReason
  order_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type ContentPageRow = {
  id: string
  position: number
  slug: string
  kind: 'page' | 'policy'
  title: string
  body_html: string | null
  seo_title: string | null
  seo_description: string | null
  published: boolean
  created_at: string
  updated_at: string
}

export type NavigationItemRow = {
  id: string
  menu: string
  label: string
  href: string
  position: number
  parent_id: string | null
  created_at: string
  updated_at: string
}

export type HomepageSectionRow = {
  id: string
  kind: string
  position: number
  enabled: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SiteSettingRow = {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

export type NewsletterSubscriberRow = {
  id: string
  email: string
  source: string
  confirmed: boolean
  unsubscribed_at: string | null
  created_at: string
}

export type RedirectRow = {
  id: string
  from_path: string
  to_path: string
  permanent: boolean
  created_at: string
}

export type AdminUserRow = {
  user_id: string
  email: string
  role: 'admin' | 'staff'
  created_at: string
}

export type Address = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address1: string
  address2?: string | null
  city: string
  region?: string | null
  postcode: string
  country_code: string
  phone?: string | null
}

/** Shape of a table for the generic Supabase client. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      products: Table<ProductRow>
      product_variants: Table<ProductVariantRow>
      product_images: Table<ProductImageRow>
      collections: Table<CollectionRow>
      collection_products: Table<CollectionProductRow>
      customers: Table<CustomerRow>
      customer_addresses: Table<CustomerAddressRow>
      carts: Table<CartRow>
      cart_items: Table<CartItemRow>
      orders: Table<OrderRow>
      order_items: Table<OrderItemRow>
      discount_codes: Table<DiscountCodeRow>
      inventory_movements: Table<InventoryMovementRow>
      content_pages: Table<ContentPageRow>
      navigation_items: Table<NavigationItemRow>
      homepage_sections: Table<HomepageSectionRow>
      site_settings: Table<SiteSettingRow>
      newsletter_subscribers: Table<NewsletterSubscriberRow>
      redirects: Table<RedirectRow>
      admin_users: Table<AdminUserRow>
    }
    Views: Record<string, never>
    Functions: {
      create_order_from_cart: {
        Args: {
          p_cart_id: string
          p_email: string
          p_shipping_address: Address
          p_billing_address: Address | null
          p_shipping_cents: number
          p_idempotency_key: string
          p_customer_id?: string | null
          p_discount_code?: string | null
          p_phone?: string | null
          p_note?: string | null
        }
        Returns: OrderRow
      }
      adjust_inventory: {
        Args: {
          p_variant_id: string
          p_delta: number
          p_reason: InventoryReason
          p_order_id?: string | null
          p_note?: string | null
        }
        Returns: number
      }
      restock_order: {
        Args: { p_order_id: string }
        Returns: void
      }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      product_status: ProductStatus
      collection_status: CollectionStatus
      order_status: OrderStatus
      payment_status: PaymentStatus
      fulfilment_status: FulfilmentStatus
      discount_kind: DiscountKind
      inventory_reason: InventoryReason
    }
    CompositeTypes: Record<string, never>
  }
}
