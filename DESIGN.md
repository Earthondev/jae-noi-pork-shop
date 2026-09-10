---
name: เจ๊น้อย product detail
description: Implemented product detail surface within the existing Thai shop identity
colors:
  red-950: "#571414"
  red-800: "#7a1f1f"
  red-700: "#9C2A2A"
  cream-50: "#FAF9F6"
  cream-100: "#F5E8C7"
  ink: "#2a1816"
  muted: "#6e5855"
  line: "#ebd6c8"
  white: "#ffffff"
  gold-500: "#D4A017"
typography:
  headline:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "clamp(30px, 4vw, 46px)"
    lineHeight: 1.3
  body:
    fontFamily: "Noto Sans Thai, sans-serif"
    lineHeight: 1.8
  price:
    fontSize: "28px"
    fontWeight: 750
rounded:
  sm: "14px"
  md: "20px"
spacing:
  section: "48px"
  action-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.red-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.red-800}"
---

# Design System: เจ๊น้อย product detail

## Overview

**Creative North Star: "The familiar Thai shop counter"**

Warm Thai shop identity, with real food photography, cream surfaces, dark brown reading text and a clear red purchase action. This scan documents only the implemented product detail surface; it does not redefine the homepage, checkout or administration.

The metaphor describes the approved incumbent identity; it is not a new brand direction.

**Key Characteristics:**

- Real product photography with square framing.
- Readable Thai copy and restrained separators.
- Visible keyboard focus and native disclosure behavior.

## Colors

### Primary

Traditional shop red identifies the purchase action; deeper reds distinguish price, heading and hover state.

### Neutral

Clean cream forms the page, warmer cream backs photographs, and dark brown carries copy. Muted brown supports units and store context; the pale line token separates information. White is the CTA text.

### Secondary

Gold is the inherited keyboard focus indicator, not a new decorative accent.

## Typography

Product copy and headings inherit Noto Sans Thai through the body font variable. The headline uses the frontmatter scale, switching to (32px) on mobile. Price is prominent, with units reduced to (16px). Disclosure headings are (20px), related-section headings (24px), and related product names (18px). Preserve line breaks and wrapping in shop-authored long copy.

## Layout

The shell is centered with a maximum width of (1120px), horizontal padding of (16px), and bottom space for the existing navigation and safe area. Desktop pairs equal image and purchase columns with a responsive gap of (24–64px). At widths at or below (720px), the image precedes the purchase content in one column with a (20px) gap; the primary action expands into available width.

Information is centered within (800px). Related products use four columns, becoming two on mobile. These are product-detail rules, not global layout requirements.

## Elevation & Depth

The product-specific layout is flat: cream tones, whitespace and thin separators provide hierarchy. No new shadows are introduced by the detail stylesheet; inherited shared navigation retains its existing treatment.

## Shapes

The main photograph is square and clipped to the medium radius. CTA and related photographs use the small radius. Thumbnail images have gently rounded (9px) corners inside selectable borders. All photos use cover cropping without distortion.

## Components

- **Purchase action:** red with white bold text, darkening on hover. Minimum height is (48px). Its label and destination reflect the real order state.
- **Gallery:** the first uploaded image is selected initially. Multiple images expose wrapping (64px) thumbnails with accessible labels, pressed state and a red selected border. A single image has no thumbnail strip.
- **Disclosures:** native details/summary controls, initially closed, with thin top borders and a minimum (48px) summary target. No synthetic accordion animation.
- **Related products:** image, name, live price and unit are one link; up to four items, with the current category preferred.
- **Navigation:** retain the shared page navigation and wrapping breadcrumb trail with the current-page marker.

CTA background and thumbnail border changes take (150ms); reduced-motion preference disables those transitions. Interactive elements inherit the gold (3px) focus outline with a (3px) offset.

## Do's and Don'ts

### Do:

- Do inherit the existing CSS custom properties.
- Do preserve square photo geometry and keyboard-visible selection.
- Do show optional guidance only when confirmed by the shop and configured in code by stable product ID.

### Don't:

- Don't invent prices, care claims or policy content.
- Don't impose this surface composition on unrelated routes.
