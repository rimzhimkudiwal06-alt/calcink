/**
 * CalcInk Scratch-to-Erase Gesture Recognition Engine
 *
 * Implements a 100% offline, zero-dependency gesture classifier that detects
 * rapid scribbling / zig-zag back-and-forth strokes drawn over existing ink.
 *
 * Characteristics of a scratch gesture:
 * 1. Rapid directional reversals (at least 4 direction changes) along the primary axis.
 * 2. High path-length to bounding-box diagonal ratio (dense scribble in compact area).
 * 3. Spatial intersection with one or more previously completed strokes.
 *
 * Executed strictly on `pointerup` to preserve 60+ FPS during active drawing (Rule 3).
 */

import type { Stroke } from '../types';
import { getStrokeBoundingBox, isPointNearStroke } from './geometry';

export interface ScratchGestureAnalysis {
  isScratch: boolean;
  reversalCount: number;
  lengthRatio: number;
}

/**
 * Analyzes a stroke's geometric trajectory to determine whether it constitutes
 * a deliberate scratch/scribble gesture.
 *
 * @param stroke - The candidate stroke to evaluate
 * @returns ScratchGestureAnalysis object containing classification and metrics
 */
export function analyzeScratchGesture(stroke: Stroke): ScratchGestureAnalysis {
  const pts = stroke.points;
  if (!pts || pts.length < 8) {
    return { isScratch: false, reversalCount: 0, lengthRatio: 0 };
  }

  // 1. Calculate total cumulative path length
  let totalLength = 0;
  for (let i = 1; i < pts.length; i++) {
    totalLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }

  if (totalLength < 35) {
    return { isScratch: false, reversalCount: 0, lengthRatio: 0 };
  }

  // 2. Calculate bounding box diagonal
  const bbox = getStrokeBoundingBox(stroke);
  const bboxWidth = bbox.maxX - bbox.minX;
  const bboxHeight = bbox.maxY - bbox.minY;
  const bboxDiag = Math.hypot(bboxWidth, bboxHeight);

  if (bboxDiag < 10) {
    return { isScratch: false, reversalCount: 0, lengthRatio: 0 };
  }

  const lengthRatio = totalLength / bboxDiag;

  // 3. Count directional reversals along X and Y axes
  // Filter out tiny micro-jitter (< 3.5px) to detect true intentional zig-zag strokes
  const minDelta = 3.5;
  let reversalsX = 0;
  let reversalsY = 0;

  let lastDx = 0;
  let lastDy = 0;

  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;

    if (Math.abs(dx) >= minDelta) {
      const signX = Math.sign(dx);
      if (lastDx !== 0 && signX !== lastDx) {
        reversalsX++;
      }
      lastDx = signX;
    }

    if (Math.abs(dy) >= minDelta) {
      const signY = Math.sign(dy);
      if (lastDy !== 0 && signY !== lastDy) {
        reversalsY++;
      }
      lastDy = signY;
    }
  }

  const totalReversals = Math.max(reversalsX, reversalsY);

  // A deliberate scribble has at least 4 direction reversals and a high density ratio
  const isScratch = totalReversals >= 4 && lengthRatio >= 2.0;

  return {
    isScratch,
    reversalCount: totalReversals,
    lengthRatio,
  };
}

/**
 * Identifies which existing canvas strokes are hit by a scratch gesture.
 *
 * @param scratchStroke - The scribble stroke
 * @param existingStrokes - The list of existing strokes currently on canvas
 * @param hitRadius - Proximity radius in CSS pixels (default: 16px)
 * @returns Array of existing strokes that were scratched over
 */
export function findScratchedStrokes(
  scratchStroke: Stroke,
  existingStrokes: Stroke[],
  hitRadius: number = 16
): Stroke[] {
  if (!scratchStroke.points || scratchStroke.points.length === 0) {
    return [];
  }

  const scratchBbox = getStrokeBoundingBox(scratchStroke);
  const matchedStrokes: Stroke[] = [];

  // Sub-sample scratch stroke points for fast, lightweight hit-testing
  const sampleStep = Math.max(1, Math.floor(scratchStroke.points.length / 15));
  const samplePoints: { x: number; y: number }[] = [];
  for (let i = 0; i < scratchStroke.points.length; i += sampleStep) {
    samplePoints.push({ x: scratchStroke.points[i].x, y: scratchStroke.points[i].y });
  }

  for (const candidate of existingStrokes) {
    // Don't test the scratch stroke against itself
    if (candidate.id === scratchStroke.id) continue;

    // Fast bounding box intersection test
    const candBbox = getStrokeBoundingBox(candidate);
    const padding = hitRadius + candidate.width / 2;

    const overlaps =
      !(scratchBbox.maxX + padding < candBbox.minX ||
        scratchBbox.minX - padding > candBbox.maxX ||
        scratchBbox.maxY + padding < candBbox.minY ||
        scratchBbox.minY - padding > candBbox.maxY);

    if (!overlaps) continue;

    // Test bidirectional proximity:
    // 1. Check if candidate stroke points fall near the scribble stroke path
    let isHit = false;
    for (const pt of candidate.points) {
      if (isPointNearStroke(pt, scratchStroke, hitRadius)) {
        isHit = true;
        break;
      }
    }

    // 2. Also check if scribble sample points touch the candidate stroke
    if (!isHit) {
      for (const pt of samplePoints) {
        if (isPointNearStroke(pt, candidate, hitRadius)) {
          isHit = true;
          break;
        }
      }
    }

    if (isHit) {
      matchedStrokes.push(candidate);
    }
  }

  return matchedStrokes;
}
