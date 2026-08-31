-- Content pages need an explicit order.
--
-- The footer policy links on the reference storefront follow the shop's own
-- order (Privacy, Refund, Contact information, Terms of service, Shipping,
-- Legal notice), not an alphabetical one. Without a position column the footer
-- silently re-sorts them, which is a visible difference.

alter table content_pages
  add column position integer not null default 0;

create index content_pages_kind_position_idx on content_pages (kind, position);
