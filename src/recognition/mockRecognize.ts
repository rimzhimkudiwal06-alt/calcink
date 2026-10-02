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

/**
 * Simulates recognizing handwritten strokes into mathematical symbols.
 * Returns a hard-coded sample expression "18 + 4 × 3 =" for testing.
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

  // Mock symbols layout: "18 + 4 × 3 ="
  return [
    { char: '1', bbox: { x: minX + 0, y: baselineY, w: 20, h: height }, confidence: 0.99 },
    { char: '8', bbox: { x: minX + 25, y: baselineY, w: 24, h: height }, confidence: 0.98 },
    { char: '+', bbox: { x: minX + 55, y: baselineY + height * 0.2, w: 22, h: height * 0.6 }, confidence: 0.99 },
    { char: '4', bbox: { x: minX + 85, y: baselineY, w: 24, h: height }, confidence: 0.97 },
    { char: '×', bbox: { x: minX + 115, y: baselineY + height * 0.25, w: 20, h: height * 0.5 }, confidence: 0.95 },
    { char: '3', bbox: { x: minX + 140, y: baselineY, w: 22, h: height }, confidence: 0.98 },
    { char: '=', bbox: { x: maxX + 10, y: baselineY + height * 0.2, w: 25, h: height * 0.5 }, confidence: 0.99 },
  ];
}
