/**
 * CalcInk Mock Handwriting Recognition Service
 *
 * Simulates Person B's handwriting recognition model (Web Worker / Neural Net).
 * Has the EXACT function signature so it can be swapped with one line when Person B is ready:
 *   import { recognize } from '../recognition/mockRecognize';
 *   ->
 *   import { recognize } from '../recognition/recognize';
 */

import type { Stroke, RecognizedSymbol } from '../types';

let currentMockEquation = '18 + 4 × 3 =';

/**
 * Updates the mock equation for testing different equations and edge cases.
 *
 * @param expr - Expression to simulate (e.g. "3 + 3 =", "10 / 2 =", "5 / 0 =")
 */
export function setMockEquation(expr: string): void {
  const trimmed = expr.trim();
  currentMockEquation = trimmed.endsWith('=') ? trimmed : `${trimmed} =`;
}

/**
 * Returns current mock equation string.
 */
export function getMockEquation(): string {
  return currentMockEquation;
}

/**
 * Simulates recognizing handwritten strokes into mathematical symbols.
 * Returns symbols for the configured mock expression positioned relative to the drawn strokes.
 *
 * @param strokes - Array of strokes captured from the canvas
 * @returns Promise resolving to an array of recognized symbols
 */
export async function recognize(strokes: Stroke[]): Promise<RecognizedSymbol[]> {
  // If no strokes are present on canvas, return empty recognition list
  if (!strokes || strokes.length === 0) {
    return [];
  }

  // Simulate short neural network processing latency (~50ms)
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Determine an approximate horizontal position based on the strokes' bounding area
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!isFinite(minX)) {
    minX = 100;
    minY = 150;
    maxX = 350;
    maxY = 190;
  }

  const height = Math.max(30, maxY - minY);
  const baselineY = minY;

  // Split currentMockEquation into individual non-whitespace characters
  const chars = currentMockEquation.replace(/\s+/g, '').split('');
  if (chars.length === 0) {
    return [];
  }

  // Calculate proportional spacing across the drawn width or standard character widths
  const charWidth = Math.max(18, Math.min(32, Math.round(height * 0.6)));
  const spacing = Math.max(6, Math.round(charWidth * 0.25));

  const symbols: RecognizedSymbol[] = [];
  let currentX = minX;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isEquals = ch === '=';
    const isOperator = ch === '+' || ch === '-' || ch === '×' || ch === '*' || ch === '÷' || ch === '/';

    // Last character '=' placed right at or after maxX
    const symX = isEquals && i === chars.length - 1 ? Math.max(currentX, maxX + 8) : currentX;
    const symY = isOperator || isEquals ? baselineY + height * 0.2 : baselineY;
    const symH = isOperator || isEquals ? height * 0.6 : height;
    const symW = isEquals ? charWidth * 1.1 : charWidth;

    symbols.push({
      char: ch,
      bbox: {
        x: symX,
        y: symY,
        w: symW,
        h: symH,
      },
      confidence: 0.98,
    });

    currentX = symX + symW + spacing;
  }

  return symbols;
}
