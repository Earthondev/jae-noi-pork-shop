---
version: 1
slug: "app-products-item-id-page-tsx"
primary_target: "app/products/item/[id]/page.tsx"
related_targets: ["app/products/item/[id]/product-detail.css","app/_components/shop/product-gallery.tsx"]
---

# Product detail surface

Scope: `/products/item/[id]`, existing Thai storefront customers deciding to buy or checking shop-provided care information after delivery.

Chosen direction: pair real square product photography with the purchase summary on desktop; present image first on mobile. The memorable moment is seeing the food and its current price/order state together, followed by an obvious route into the existing ordering flow.

Content and action: D1 supplies names, photos, prices, units and visibility. Optional shop-confirmed guidance is maintained in `lib/product-content.ts`, keyed by stable product ID; the initial mapping is empty. Use uploaded gallery images, native expandable information and related live products. Preserve existing URLs, sales-round behavior and original administration capabilities. No new admin fields or database changes. Missing optional guidance stays absent; never fabricate product or policy claims.

Boundaries: no deployment. Visual tokens belong in DESIGN.md. The implementation uses existing CSS and native interactions. Reviewer disposition supplied to the documenter: Ship, no material findings. No unresolved design decisions recorded.
