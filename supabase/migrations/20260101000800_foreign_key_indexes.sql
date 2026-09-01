-- Index the foreign keys that were not covered.
--
-- Postgres indexes the *referenced* side of a foreign key automatically (it has
-- to, to enforce uniqueness) but never the referencing side. Without an index
-- there, two things degrade quietly:
--
--   * every delete or key update on the parent row does a sequential scan of
--     the child table to check the constraint — so deleting one variant scans
--     all cart_items, and it gets slower as the store grows;
--   * joins and lookups from the child side scan too.
--
-- These five were the ones left uncovered. `npm run supabase:verify` checks for
-- this, so a future foreign key added without an index gets caught.

-- Deleting or archiving a variant checks these two.
create index if not exists product_images_variant_idx
  on product_images (variant_id) where variant_id is not null;

create index if not exists cart_items_variant_idx
  on cart_items (variant_id);

-- Order history joins back to the product; the variant side was already
-- indexed, the product side was not.
create index if not exists order_items_product_idx
  on order_items (product_id) where product_id is not null;

-- "What did this admin change?" and the admin_users delete path.
create index if not exists inventory_movements_created_by_idx
  on inventory_movements (created_by) where created_by is not null;

-- Menus are read by walking children from a parent on every page render.
create index if not exists navigation_items_parent_idx
  on navigation_items (parent_id) where parent_id is not null;
