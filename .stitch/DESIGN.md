# Design System: Jay Noy Shop Redesign — "Authentic Market Premium"

**Retrieved via:** Stitch MCP (`list_projects` → `get_project` → `list_screens` → `get_screen`)
**Retrieved at (UTC):** `2026-07-14T08:47:53Z`
**Project ID:** `4713816981186849297` (`projects/4713816981186849297`)
**Screen ID:** `c0ae1155c87b47949343a87d837d2512` — title "เจ๊น้อย เขียงหมูตะคร้อ - Homepage Redesign" (`deviceType: MOBILE`, source dimensions `780×5472`, generated from the "Authentic Market Premium" Design System instance in the same project)
**Source assets saved locally:**
- `.stitch/designs/storefront-mobile.html` — full generated HTML/Tailwind source
- `.stitch/designs/storefront-mobile.png` — full-resolution screenshot (780×5472), visually audited against the HTML before writing this document

> ⚠️ A second screen in the project (`3309942101735479391`, `incognito-mobile-production-top-390x844.png`) is a screenshot of the **current live production site** imported for Stitch's own reference. It is *not* a new design and was intentionally excluded as a source for this document.

---

## 1. Visual Theme & Atmosphere

**"Paper and Produce."** Light, airy, appetite-forward. A soft cream base (like high-quality butcher paper) carries deep market-red and golden-yolk-yellow accents used sparingly for trust and urgency cues (best-seller badges, prices, primary actions). Corners are consistently soft/rounded and shadows are whisper-diffused rather than heavy — the goal stated by Stitch itself is "Quality Guaranteed" through clean layout, offset by rounded corners and human, market-stall photography (the shop owner's portrait, hands holding product) for warmth. Compared to the current live site (solid market-red full-bleed header/hero with white text), this redesign inverts the hero to a **light** surface with dark text and reserves saturated red/gold for accents, buttons, and badges only.

## 2. Color Palette & Roles

Values below are read directly from the screen's generated `tailwind.config` (`storefront-mobile.html`) and cross-checked against the project's `designTheme.namedColors` / `designMd` front-matter — both matched exactly.

| Token | Hex | Role |
|---|---|---|
| `primary` | `#af101a` | Deep Market Red — prices, primary text accents, icon circles, link/active color |
| `primary-container` | `#d32f2f` | Saturated Market Red — reserved for stronger emphasis states |
| `primary-fixed` | `#ffdad6` | Pale Rose — background of the small pulsing "ทำสดทุกวัน" eyebrow chip in the hero |
| `on-primary-fixed-variant` | `#930010` | Darkest red — used here for pressed/shadow depth cues |
| `secondary` | `#7e5700` | Muted Gold-Brown — text-on-light secondary accents |
| `secondary-container` | `#feb300` | Golden Yolk Yellow — **primary CTA** ("เลือกสินค้า" button), Best-Seller badge, active bottom-nav pill |
| `on-secondary-container` | `#6a4800` | Dark brown text sitting on the yellow CTA/badges for contrast |
| `surface` / `background` | `#fff8f5` | Soft Cream — page background (lighter/warmer than the current site's `#fffaf0`) |
| `surface-container-lowest` | `#ffffff` | Pure White — cards (preorder status card, product cards, phone buttons) |
| `surface-container-low` | `#fbf2ed` | Slightly deeper cream — contact/phone section block |
| `surface-container` | `#f5ece7` | Tonal layer between low/high |
| `surface-container-high` | `#efe6e2` | Neutral chip background (e.g. circular add-to-cart icon button, idle state) |
| `on-surface` | `#1e1b18` | Warm Charcoal — primary body/headline text (never pure black) |
| `on-surface-variant` | `#5b403d` | Muted brown — secondary/supporting text |
| `outline-variant` | `#e4beba` | Card border hairlines |
| `outline` | `#8f6f6c` | Slightly stronger border/divider tone |

**Design principle from Stitch's own brief:** "Local Trust: use familiar red/yellow color cues but refined to prevent visual fatigue" — i.e. red and yellow are accent colors on top of a dominant cream field, not the dominant field themselves.

## 3. Typography — ⚠️ Thai-compatibility finding

Stitch's generated config specifies **Be Vietnam Pro** for all headline/body/label roles and its own `designMd` claims (verbatim) *"selected for its exceptional support for Thai glyphs."*

**This claim was independently verified and is factually incorrect.** Google Fonts metadata for Be Vietnam Pro lists only `latin`, `latin-ext`, `vietnamese` subsets — **no `thai` subset exists**. Requesting `&subset=thai` from the Google Fonts API silently falls back to Latin glyphs only. Since 100% of this storefront's content is Thai copy, applying this font would break body/heading text.

**Resolution applied (already live in `app/layout.tsx`):** keep **Noto Sans Thai** (body) / **Noto Serif Thai** (display/headline) via `next/font/google`, both of which have full Thai coverage and are already validated in production. The type **scale, weight, and letter-spacing** from Stitch are still adopted — only the *family* differs from Stitch's literal token.

| Role | Stitch token (size/weight/line-height) | Fallback family actually used |
|---|---|---|
| `headline-xl` (desktop hero) | 40px / 700 / 52px / `-0.02em` | Noto Serif Thai |
| `headline-lg` | 32px / 700 / 40px | Noto Serif Thai |
| `headline-lg-mobile` (mobile hero h2) | 28px / 700 / 36px | Noto Serif Thai |
| `headline-md` (card titles, section h3) | 24px / 600 / 32px (product name/price overridden inline to 18–22px) | Noto Serif Thai |
| `body-lg` | 18px / 400 / 28px | Noto Sans Thai |
| `body-md` (default body) | 16px / 400 / 24px | Noto Sans Thai |
| `label-md` | 14px / 600 / 20px / `0.01em` | Noto Sans Thai |
| `label-sm` (badges, eyebrow) | 12px / 500 / 16px | Noto Sans Thai |

## 4. Spacing, Radius, Shadow & Motion

**Spacing scale** (from `designMd` front-matter, matches the Tailwind `extend.spacing` in the generated screen):
`base 4px · xs 8px · sm 16px · md 24px · lg 40px · xl 64px · gutter 20px · margin-mobile 16px · margin-desktop 120px`

**Radius** — ⚠️ discrepancy noted between Stitch's own prose and its generated code:
- `designMd` prose states cards should use a "24px corner radius."
- The *actual* generated `tailwind.config.borderRadius` on this screen overrides `xl` to **12px** (`{"DEFAULT":"0.25rem","lg":"0.5rem","xl":"0.75rem","full":"9999px"}`), and every card in the real HTML uses the `rounded-xl` class → **12px in practice**. Pills/avatars/buttons use `rounded-full`.
- **Decision:** treat the concrete generated screen as source of truth over the prose (per the instruction to use Stitch MCP screen output, not assumptions). Implementation should target ~12–16px for cards, full-pill for buttons/badges/avatars.

**Shadow** — "light and airy," never heavy: cards at rest use Tailwind's default `shadow-sm`/no shadow; hover/interactive states step up to `shadow-md`. No hard 3D/offset shadows appear anywhere in this screen (this differs from the current live site's "pressed-button" hard-offset shadows on several CTAs).

**Motion** (all present in the generated HTML, exact Tailwind utilities):
- Hero portrait: `rotate-3` at rest → `hover:rotate-0`, `transition-transform duration-500`
- "สดจริง/จากร้าน" badge ring: `border-2 border-dashed border-primary` with continuous `animate-[spin_10s_linear_infinite]`
- Eyebrow chip dot: `animate-pulse`
- Primary CTA button: `hover:scale-105 active:scale-95 transition-all`
- Product card: `hover:shadow-md transition-shadow`; product image `group-hover:scale-110 transition-transform duration-500`
- Phone/cart pill links: `active:scale-95 transition-transform`
- Header: adds `shadow-md` (from `shadow-sm`) via a scroll listener once `scrollY > 20`
- Global press feedback script: adds/removes an `opacity-80` class on `mousedown`/`mouseup`/`mouseleave` for every `button`/`a`

## 5. Mobile Layout @390px — Section by Section

Canvas is authored device-agnostic (`w-full`, `md:` breakpoints) but the audited screenshot and structure below describe the **390px mobile column** specifically, top to bottom:

### Header (sticky, `h-16`/64px)
`bg-surface/80` + `backdrop-blur-md`, translucent-on-scroll. Left: 40×40 circular logo mark (red fill, white/gold ring) + shop name text beside it. Right: cart pill (`bg-secondary-container`, icon + count, `active:scale-95`). Text nav links (`สินค้า`, `ติดตามออเดอร์`) are `hidden md:block` — **hidden on mobile**, visible desktop-only (mobile users rely on the bottom nav instead).

### Hero
`hero-gradient` = two very faint radial tints (gold top-right ~10%, red bottom-left ~5%) over `bg-surface`. Content: small pill eyebrow chip with pulsing dot + "ของอร่อยจากตะคร้อ • ทำสดทุกวัน"; `headline-lg-mobile` two-line headline with second line in `text-primary`; body copy in `on-surface-variant`; full-width pill CTA "เลือกสินค้า" in `secondary-container`. Below/overlapping: circular portrait (rotated 3°, white 8px ring, shadow-xl) with a dashed-spinning "สดจริง/จากร้าน" badge overlapping its bottom-left corner.

### Preorder status card
A **separate, distinct white card** (`surface-container-lowest`, `rounded-xl`, `shadow-sm`, `border border-outline-variant`) that visually floats over the hero's bottom edge (`-mt-8` negative margin). Content is centered/stacked (not left-aligned): circular icon chip on top (`event_busy` when no round is open), headline in `primary`, supporting line in `on-surface-variant`.

### Product section
Small `secondary`-colored eyebrow label → `headline-lg-mobile` section title → supporting paragraph (copy is byte-for-byte identical to the current site's copy). Cards: `bg-surface-container-lowest`, `rounded-xl`, `border-outline-variant`, `hover:shadow-md`; image block `h-48` (192px) with `object-cover` and a top-left "Best Seller" pill badge on the first card only; body padding `p-md` (24px); name at `headline-md`(18px override), description `body-md line-clamp-2`; **price + a small circular icon-only add-to-cart button share one row** (`flex justify-between items-center`) rather than the current site's full-width text button below the price.

### Phone / contact block
Full-bleed `surface-container-low` band (not a card): icon chip + "โทรสั่งซื้อ / สอบถาม" heading + subtext, followed by **two stacked (single-column) white pill buttons**, each showing a small "โทร" label above a large `headline-md` phone number. This replaces the current site's 2-column grid with hard drop-shadow "pressed" buttons.

### Sticky cart / bottom navigation — **new pattern, not present on the current site**
A `fixed bottom-0` bar (`md:hidden`), translucent cream + `backdrop-blur-xl`, top hairline border, `env(safe-area-inset-bottom)`-aware padding. Four equally-spaced items, icon-over-label: หน้าหลัก (home, active state = filled icon + `secondary-container` pill background), สินค้า, ติดตาม, ตะกร้า. This is the primary mobile navigation surface; the header's text links are explicitly hidden on mobile in favor of this bar.

## 6. Layout Principles

- Mobile: single column, `margin-mobile` = 16px side gutters, sections separated by generous vertical rhythm (`lg`/40px or `xl`/64px) rather than borders.
- Desktop (≥720px, not the focus of this document but present in the source): 3-column product grid, 120px safe margin, nav links reappear in the header, bottom nav bar disabled.
- No harsh 1px dividers between unrelated sections where a background tonal shift (e.g. `surface` → `surface-container-low`) can do the same job — consistent with the "light and airy" elevation principle.

## 7. Known deltas already implemented on the live site (for traceability)

These were applied in a prior pass (see git history / chat log) using this same Stitch source, ahead of this formal `DESIGN.md` being written:
- CSS custom-property values in `app/globals.css` (`--red-700`, `--gold-500`, `--cream-50`, `--ink`, `--muted`, `--line`, `--white`, `--shadow-sm/lg`, `--radius-sm/md/lg`) updated to the palette/radius/shadow above.
- Header restyled translucent + logo/name pairing; text nav hidden on mobile.
- New `.bottom-nav` component added (4 items, active-pill state), with `.floating-cart` / `.storefront-notice` / `footer` offsets adjusted to clear it.
- Hero recolored to light surface with dark text; portrait ring changed gold → white.
- Product image height reduced 290px → 240px (a deliberate middle ground between Stitch's 192px and the original 290px — see §5 rationale on "appetizing clarity" vs. density).
- Phone strip restacked to single column, hard 3D shadow removed.
- Font family was **not** changed (see §3).

This document is the reference for any *future* sync pass — see the companion implementation Plan Artifact for what is proposed next.
