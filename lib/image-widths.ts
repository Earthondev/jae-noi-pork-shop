/**
 * Widths this app asks for with an explicit `width={n}` and no `sizes`, which
 * vinext's default device/image size lists do not contain.
 *
 * `/_vinext/image` answers **400** for any width outside its allow-list, so a
 * width missing here is a broken image in production rather than a slow one —
 * the shop logo (`width={80}`) disappeared from every page's header the moment
 * image optimization started working, because 80 sits between the defaults 64
 * and 96.
 *
 * Keep in step with `width={n}` in `app/**`; `tests/image-widths.test.mjs`
 * fails if they drift apart.
 */
export const APP_IMAGE_WIDTHS = [80, 150, 760, 900, 1000, 1100] as const;
