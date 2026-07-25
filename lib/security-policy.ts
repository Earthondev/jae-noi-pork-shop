// The storefront does not need hardware, location, credential, or screen
// capture access. Deny these capabilities at the browser policy layer so
// application code and same-origin scripts cannot trigger permission prompts.
//
// clipboard-write and web-share are intentionally not disabled: checkout uses
// them only after a customer gesture to copy payment details or share a receipt.
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "bluetooth=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "idle-detection=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-create=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "speaker-selection=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");
