/**
 * CalcInk Geometry & Hit-Testing Utilities
 *
 * Pure mathematical functions for:
 * 1. Point-to-segment distance calculation (for stroke eraser hit-testing)
 * 2. Stroke splitting at erased points (for pixel eraser partial erasing)
 */

import type { Point, Stroke } from '../types';

/**
 * Computes the shortest Euclidean distance from point (px, py)
 * to line segment between (x1, y1) and (x2, y2).
 *
 * @param px - Target point X
 * @param py - Target point Y
 * @param x1 - Segment start X
 * @param y1 - Segment start Y
 * @param x2 - Segment end X
 * @param y2 - Segment end Y
 * @returns Shortest distance in coordinate units
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  // Segment is degenerate (a single point)
  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  // Projection factor t of point onto line segment, clamped between 0 and 1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Computes the axis-aligned bounding box of a stroke.
 *
 * @param stroke - The stroke to measure
 * @returns Bounding box { minX, minY, maxX, maxY }
 */
export function getStrokeBoundingBox(stroke: Stroke): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const pts = stroke.points;
  if (!pts || pts.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const padding = stroke.width / 2;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Determines whether a target point (e.g. from an eraser cursor) hits a given stroke.
 *
 * @param point - Center of the eraser/touch point
 * @param stroke - The stroke to test against
 * @param eraserRadius - Radius of the eraser in CSS pixels
 * @returns True if point is within eraser radius of the stroke
 */
export function isPointNearStroke(
  point: { x: number; y: number },
  stroke: Stroke,
  eraserRadius: number
): boolean {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return false;

  const hitThreshold = eraserRadius + stroke.width / 2;

  // Quick bounding box rejection test for performance
  const bbox = getStrokeBoundingBox(stroke);
  if (
    point.x < bbox.minX - hitThreshold ||
    point.x > bbox.maxX + hitThreshold ||
    point.y < bbox.minY - hitThreshold ||
    point.y > bbox.maxY + hitThreshold
  ) {
    return false;
  }

  // Single-point stroke
  if (pts.length === 1) {
    return Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= hitThreshold;
  }

  // Multi-point stroke: check distance to each line segment
  for (let i = 0; i < pts.length - 1; i++) {
    const dist = pointToSegmentDistance(
      point.x,
      point.y,
      pts[i].x,
      pts[i].y,
      pts[i + 1].x,
      pts[i + 1].y
    );
    if (dist <= hitThreshold) {
      return true;
    }
  }

  return false;
}

/**
 * Partially erases a stroke around an eraser circle point,
 * splitting it into 0, 1, or multiple smaller strokes.
 *
 * Preserves the original stroke list as the single source of truth!
 *
 * @param stroke - The stroke to partially erase
 * @param eraserPoint - The center of the eraser
 * @param eraserRadius - Radius of the eraser circle
 * @returns Array of surviving stroke fragments
 */
export function eraseFromStroke(
  stroke: Stroke,
  eraserPoint: { x: number; y: number },
  eraserRadius: number
): Stroke[] {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return [];

  const hitThreshold = eraserRadius + stroke.width / 2;

  // Fast bounding box check
  const bbox = getStrokeBoundingBox(stroke);
  if (
    eraserPoint.x < bbox.minX - hitThreshold ||
    eraserPoint.x > bbox.maxX + hitThreshold ||
    eraserPoint.y < bbox.minY - hitThreshold ||
    eraserPoint.y > bbox.maxY + hitThreshold
  ) {
    return [stroke]; // Not touched, return original
  }

  // Subdivide any long segments so that gaps between points are smaller than hitThreshold / 2.
  // This ensures smooth partial erasing even if points were sampled far apart during fast gestures.
  const densePoints: Point[] = [];
  const maxStep = Math.max(2, hitThreshold / 2);

  for (let i = 0; i < pts.length; i++) {
    densePoints.push(pts[i]);
    if (i < pts.length - 1) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist > maxStep) {
        const steps = Math.ceil(dist / maxStep);
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          densePoints.push({
            x: p1.x + (p2.x - p1.x) * frac,
            y: p1.y + (p2.y - p1.y) * frac,
            t: p1.t + (p2.t - p1.t) * frac,
            pressure:
              p1.pressure !== undefined && p2.pressure !== undefined
                ? p1.pressure + (p2.pressure - p1.pressure) * frac
                : p1.pressure,
          });
        }
      }
    }
  }

  // Filter and split into contiguous surviving clusters
  const survivingClusters: Point[][] = [];
  let currentCluster: Point[] = [];

  for (const pt of densePoints) {
    const dist = Math.hypot(pt.x - eraserPoint.x, pt.y - eraserPoint.y);
    if (dist > hitThreshold) {
      currentCluster.push(pt);
    } else {
      // Point is inside eraser circle -> boundary cut
      if (currentCluster.length > 0) {
        survivingClusters.push(currentCluster);
        currentCluster = [];
      }
    }
  }

  if (currentCluster.length > 0) {
    survivingClusters.push(currentCluster);
  }

  // If no points were erased, return original stroke
  if (survivingClusters.length === 1 && survivingClusters[0].length === densePoints.length) {
    return [stroke];
  }

  // Convert clusters back to Stroke fragments
  const result: Stroke[] = [];
  let splitIndex = 0;

  for (const cluster of survivingClusters) {
    // Keep cluster if it has at least 1 point
    if (cluster.length > 0) {
      result.push({
        id: `${stroke.id}_split_${splitIndex++}`,
        points: cluster,
        width: stroke.width,
        color: stroke.color,
      });
    }
  }

  return result;
}
