/**
 * CalcInk Coordinate & High-DPI Helpers
 * Pure utility functions for converting between viewport, CSS, and physical device coordinates.
 */

/**
 * Converts browser viewport client coordinates (from PointerEvent clientX/clientY)
 * into canvas-relative CSS coordinates.
 *
 * @param clientX - X position relative to the browser viewport
 * @param clientY - Y position relative to the browser viewport
 * @param rect - The bounding client rectangle of the canvas
 * @returns Coordinate point { x, y } in CSS pixels relative to canvas top-left
 */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number }
): { x: number; y: number } {
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

/**
 * Converts a measurement from CSS pixels to physical device buffer pixels.
 *
 * @param cssPx - Dimension in CSS pixels
 * @param dpr - Device Pixel Ratio (window.devicePixelRatio)
 * @returns Dimension in physical device pixels
 */
export function cssToDevice(cssPx: number, dpr: number): number {
  const safeDpr = Math.max(0.1, dpr);
  return cssPx * safeDpr;
}

/**
 * Converts a measurement from physical device buffer pixels back to CSS pixels.
 *
 * @param devicePx - Dimension in physical device pixels
 * @param dpr - Device Pixel Ratio (window.devicePixelRatio)
 * @returns Dimension in CSS pixels
 */
export function deviceToCss(devicePx: number, dpr: number): number {
  const safeDpr = Math.max(0.1, dpr);
  return devicePx / safeDpr;
}

/**
 * Calculates physical canvas buffer dimensions (canvas.width, canvas.height)
 * based on CSS display dimensions and device pixel ratio.
 *
 * @param cssWidth - Display width in CSS pixels
 * @param cssHeight - Display height in CSS pixels
 * @param dpr - Device Pixel Ratio (window.devicePixelRatio)
 * @returns Rounded physical width, height, and normalized DPR
 */
export function getCanvasDeviceSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number
): { width: number; height: number; dpr: number } {
  const safeDpr = Math.max(0.1, dpr || 1);
  return {
    width: Math.max(1, Math.round(cssWidth * safeDpr)),
    height: Math.max(1, Math.round(cssHeight * safeDpr)),
    dpr: safeDpr,
  };
}
