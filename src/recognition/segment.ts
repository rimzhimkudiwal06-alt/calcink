import type { Stroke, BoundingBox, Point } from './types';

export interface StrokeBBox extends BoundingBox {
  xMin: number; yMin: number; xMax: number; yMax: number;
  cx: number; cy: number; tStart: number; tEnd: number;
}

export interface StrokeGroup {
  strokes: Stroke[];
  bbox: StrokeBBox;
  lineIndex?: number;
}

// All ratios are relative to "typical symbol size" (75th percentile of max(w,h)).
export interface SegmentationConfig {
  maxTimeGapMs: number;
  barOverlapThreshold: number;    // '=': min x-overlap (IoU) of the two bars
  stackedGapRatio: number;        // '=': max vertical gap between bars
  divDotGapRatio: number;         // '÷': max vertical gap bar <-> dot
  dotSizeRatio: number;           // a stroke smaller than this is a "dot"
  plusMissRatio: number;          // '+': tolerance when the two strokes just miss each other
  touchOverlapThreshold: number;  // multi-stroke digits (e.g. 5): min x-overlap (IoU)
  touchGapRatio: number;          // multi-stroke digits: max vertical gap
  lineClusterMarginRatio: number; // multi-line: max centre distance within one line
}

export const DEFAULT_SEGMENTATION_CONFIG: SegmentationConfig = {
  maxTimeGapMs: 400,
  barOverlapThreshold: 0.5,
  stackedGapRatio: 0.6,
  divDotGapRatio: 0.8,
  dotSizeRatio: 0.3,
  plusMissRatio: 0.15,
  touchOverlapThreshold: 0.5,
  touchGapRatio: 0.25,
  lineClusterMarginRatio: 0.7,
};

export function getStrokeBBox(stroke: Stroke): StrokeBBox {
  if (!stroke.points || stroke.points.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0, cx: 0, cy: 0, tStart: 0, tEnd: 0 };
  }
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  let tStart = Infinity, tEnd = -Infinity;
  for (const p of stroke.points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    if (p.t < tStart) tStart = p.t;
    if (p.t > tEnd) tEnd = p.t;
  }
  const w = Math.max(1, xMax - xMin);
  const h = Math.max(1, yMax - yMin);
  return {
    x: xMin, y: yMin, w, h, xMin, yMin, xMax, yMax,
    cx: xMin + w / 2, cy: yMin + h / 2,
    tStart: isFinite(tStart) ? tStart : 0,
    tEnd: isFinite(tEnd) ? tEnd : 0,
  };
}

export function combineBBoxes(b1: StrokeBBox, b2: StrokeBBox): StrokeBBox {
  const xMin = Math.min(b1.xMin, b2.xMin);
  const yMin = Math.min(b1.yMin, b2.yMin);
  const xMax = Math.max(b1.xMax, b2.xMax);
  const yMax = Math.max(b1.yMax, b2.yMax);
  const w = Math.max(1, xMax - xMin);
  const h = Math.max(1, yMax - yMin);
  return {
    x: xMin, y: yMin, w, h, xMin, yMin, xMax, yMax,
    cx: xMin + w / 2, cy: yMin + h / 2,
    tStart: Math.min(b1.tStart, b2.tStart),
    tEnd: Math.max(b1.tEnd, b2.tEnd),
  };
}

// ---------- geometry helpers ----------

function doBBoxesIntersect(a: StrokeBBox, b: StrokeBBox): boolean {
  return !(a.xMax < b.xMin || a.xMin > b.xMax || a.yMax < b.yMin || a.yMin > b.yMax);
}

/** x-overlap divided by the union width: ~0 for neighbours, ~1 for stacked bars. */
function overlapIoUX(a: StrokeBBox, b: StrokeBBox): number {
  const overlap = Math.max(0, Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin));
  const union = Math.max(a.xMax, b.xMax) - Math.min(a.xMin, b.xMin);
  return union > 0 ? overlap / union : 0;
}

function verticalGap(a: StrokeBBox, b: StrokeBBox): number {
  return Math.max(0, Math.max(a.yMin, b.yMin) - Math.min(a.yMax, b.yMax));
}

const isFlat = (b: StrokeBBox) => b.w >= 2 * b.h; // horizontal bar
const isTall = (b: StrokeBBox) => b.h >= 2 * b.w; // vertical bar

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/** Keep ~maxPts evenly spaced points so segments are long enough to actually cross. */
function simplify(points: Point[], maxPts = 20): Point[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  const out: Point[] = [];
  for (let i = 0; i < maxPts; i++) out.push(points[Math.round(i * step)]);
  return out;
}

function doStrokesCross(s1: Stroke, s2: Stroke): boolean {
  const a = simplify(s1.points);
  const b = simplify(s2.points);
  if (a.length < 2 || b.length < 2) return false;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

// ---------- merge decision ----------

export function shouldMergeStrokes(
  b1: StrokeBBox, s1: Stroke,
  b2: StrokeBBox, s2: Stroke,
  typical: number,
  config: SegmentationConfig = DEFAULT_SEGMENTATION_CONFIG,
): boolean {
  const timeGap = Math.max(0, Math.max(b1.tStart, b2.tStart) - Math.min(b1.tEnd, b2.tEnd));
  const vGap = verticalGap(b1, b2);
  const iou = overlapIoUX(b1, b2);
  const isDot = (b: StrokeBBox) => Math.max(b.w, b.h) <= typical * config.dotSizeRatio;
  const ordered: [StrokeBBox, StrokeBBox][] = [[b1, b2], [b2, b1]];

  // 1. '+' and '×': strokes physically cross
  if (doBBoxesIntersect(b1, b2) && doStrokesCross(s1, s2)) return true;

  // 2. '=': two flat bars, stacked, close together
  if (isFlat(b1) && isFlat(b2) && iou >= config.barOverlapThreshold &&
    vGap <= typical * config.stackedGapRatio) return true;

  // 3. '÷': a flat bar plus a dot above/below its middle
  for (const [bar, dot] of ordered) {
    if (isFlat(bar) && !isDot(bar) && isDot(dot) &&
      dot.cx >= bar.xMin && dot.cx <= bar.xMax &&
      vGap <= typical * config.divDotGapRatio) return true;
  }

  // 4. '+' where the strokes narrowly miss each other
  for (const [bar, stem] of ordered) {
    const tol = typical * config.plusMissRatio;
    if (isFlat(bar) && isTall(stem) && timeGap <= config.maxTimeGapMs &&
      stem.cx >= bar.xMin && stem.cx <= bar.xMax &&
      bar.cy >= stem.yMin - tol && bar.cy <= stem.yMax + tol) return true;
  }

  // 5. multi-stroke digits (e.g. '2' = loop + tail, '5' = body + bar): drawn quickly,
  //    strongly overlapping in x, and touching or overlapping in y
  if (timeGap <= config.maxTimeGapMs && iou >= config.touchOverlapThreshold &&
    vGap <= typical * config.touchGapRatio) return true;
  // 5b. same idea, but one stroke's bbox mostly sits inside the other's (loop + tail)
  if (timeGap <= config.maxTimeGapMs && doBBoxesIntersect(b1, b2)) {
    const ox = Math.max(0, Math.min(b1.xMax, b2.xMax) - Math.max(b1.xMin, b2.xMin));
    const oy = Math.max(0, Math.min(b1.yMax, b2.yMax) - Math.max(b1.yMin, b2.yMin));
    const smaller = Math.min(b1.w * b1.h, b2.w * b2.h);
    if (smaller > 0 && (ox * oy) / smaller >= 0.5) return true;
  }

  return false;
}

// ---------- main entry ----------

export function segmentStrokes(
  strokes: Stroke[],
  config: SegmentationConfig = DEFAULT_SEGMENTATION_CONFIG,
): StrokeGroup[] {
  if (!strokes || strokes.length === 0) return [];

  const bboxes = strokes.map(getStrokeBBox);

  // 75th percentile of max(w,h): robust to flat bars and dots dragging the median down
  const allSizes = bboxes.map((b) => Math.max(b.w, b.h));
  const maxSize = Math.max(...allSizes);
  // ignore tiny strokes (dots) so they can't drag "typical" down to ~1px
  const sizes = allSizes.filter((s) => s >= 0.25 * maxSize).sort((a, b) => a - b);
  const typical = sizes[Math.floor(0.75 * (sizes.length - 1))] || 20;

  const parent = Array.from({ length: strokes.length }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (shouldMergeStrokes(bboxes[i], strokes[i], bboxes[j], strokes[j], typical, config)) union(i, j);
    }
  }

  const groupMap = new Map<number, { strokes: Stroke[]; bbox: StrokeBBox }>();
  for (let i = 0; i < strokes.length; i++) {
    const root = find(i);
    const g = groupMap.get(root);
    if (!g) groupMap.set(root, { strokes: [strokes[i]], bbox: { ...bboxes[i] } });
    else { g.strokes.push(strokes[i]); g.bbox = combineBBoxes(g.bbox, bboxes[i]); }
  }
  const groups = Array.from(groupMap.values());

  // Multi-line: greedy clustering by vertical centre
  const lines: { strokes: Stroke[]; bbox: StrokeBBox }[][] = [];
  for (const group of [...groups].sort((a, b) => a.bbox.cy - b.bbox.cy)) {
    const line = lines.find((l) => {
      const avgY = l.reduce((s, g) => s + g.bbox.cy, 0) / l.length;
      return Math.abs(group.bbox.cy - avgY) <= typical * config.lineClusterMarginRatio;
    });
    if (line) line.push(group); else lines.push([group]);
  }
  const lineY = (l: { bbox: StrokeBBox }[]) => l.reduce((s, g) => s + g.bbox.cy, 0) / l.length;
  lines.sort((a, b) => lineY(a) - lineY(b));

  const result: StrokeGroup[] = [];
  lines.forEach((line, lineIdx) => {
    line.sort((a, b) => a.bbox.xMin - b.bbox.xMin);
    for (const g of line) result.push({ strokes: g.strokes, bbox: g.bbox, lineIndex: lineIdx });
  });
  return result;
}