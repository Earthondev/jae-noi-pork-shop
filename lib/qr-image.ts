export type MeasurableContext = Pick<CanvasRenderingContext2D, "font" | "measureText">;

/**
 * Sets context.font to the largest size (in 2px steps) that fits `text` within `maxWidth`, and returns the final size.
 * Guards against canvas text silently overflowing its intended bounds for CMS-editable strings of unbounded length.
 */
export function fitFontSize(
  context: MeasurableContext,
  text: string,
  maxWidth: number,
  weight: number,
  startSize: number,
  minSize: number,
): number {
  let size = startSize;
  context.font = `${weight} ${size}px "Noto Sans Thai", sans-serif`;
  while (context.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    context.font = `${weight} ${size}px "Noto Sans Thai", sans-serif`;
  }
  return size;
}

/**
 * Sizes a pill/badge background to the actual measured text width instead of a fixed guess.
 * A fixed-width pill let long text spill past its edge onto the background behind it, where
 * same-color text became invisible instead of visibly clipping.
 */
export function computePillWidth(
  measuredTextWidth: number,
  options: { paddingX: number; minWidth: number; maxWidth: number },
): number {
  return Math.min(options.maxWidth, Math.max(options.minWidth, measuredTextWidth + options.paddingX * 2));
}
