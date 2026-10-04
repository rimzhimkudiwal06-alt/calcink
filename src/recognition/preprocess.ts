import type { Stroke, Point } from './types';

export const MODEL_SIZE = 28;                 // both models take 28x28
export const BOX_SIZE = 20;                   // symbol is fitted into 20x20, 4px margin (MNIST style)
export const INPUT_SHAPE = [1, 1, MODEL_SIZE, MODEL_SIZE] as const; // NCHW
export const STROKE_WIDTH_PX = 2;             // TUNE with the debug page
export const CENTER_BY_MASS = true;           // MUST match how operators.onnx was trained
export const MAX_COM_SHIFT = 4;
export const SMALL_SYMBOL_RATIO = 0.3;

export interface PreprocessOptions {
    /** Typical symbol size in canvas px (from segmentation). Stops dots being blown up to full size. */
    referenceSize?: number;
    centerByMass?: boolean;
    strokeWidthPx?: number;
}

interface Seg { x0: number; y0: number; x1: number; y1: number }
interface Bounds { xMin: number; yMin: number; xMax: number; yMax: number }

export function getBounds(strokes: Stroke[]): Bounds | null {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const s of strokes) {
        for (const p of s.points) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            if (p.x < xMin) xMin = p.x;
            if (p.x > xMax) xMax = p.x;
            if (p.y < yMin) yMin = p.y;
            if (p.y > yMax) yMax = p.y;
        }
    }
    return xMin === Infinity ? null : { xMin, yMin, xMax, yMax };
}

function toSegments(strokes: Stroke[], cx: number, cy: number, scale: number, ox: number, oy: number): Seg[] {
    const segs: Seg[] = [];
    const map = (p: Point) => ({ x: (p.x - cx) * scale + ox, y: (p.y - cy) * scale + oy });
    for (const st of strokes) {
        const pts = st.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (pts.length === 0) continue;
        if (pts.length === 1) {
            const a = map(pts[0]);
            segs.push({ x0: a.x, y0: a.y, x1: a.x, y1: a.y }); // a tap becomes a disk
            continue;
        }
        for (let i = 0; i < pts.length - 1; i++) {
            const a = map(pts[i]), b = map(pts[i + 1]);
            segs.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
        }
    }
    return segs;
}

function distToSegment(px: number, py: number, s: Seg): number {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - s.x0) * dx + (py - s.y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy));
}

/** Draw thick anti-aliased segments into a size x size grid, values 0..1 (1 = ink). */
export function rasterize(segs: Seg[], size = MODEL_SIZE, widthPx = STROKE_WIDTH_PX): Float32Array {
    const img = new Float32Array(size * size);
    const half = widthPx / 2;
    const pad = half + 1;
    for (const s of segs) {
        const c0 = Math.max(0, Math.floor(Math.min(s.x0, s.x1) - pad));
        const c1 = Math.min(size - 1, Math.ceil(Math.max(s.x0, s.x1) + pad));
        const r0 = Math.max(0, Math.floor(Math.min(s.y0, s.y1) - pad));
        const r1 = Math.min(size - 1, Math.ceil(Math.max(s.y0, s.y1) + pad));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const d = distToSegment(c + 0.5, r + 0.5, s); // sample at pixel centre
                const v = Math.max(0, Math.min(1, half + 0.5 - d)); // 1px soft edge
                const i = r * size + c;
                if (v > img[i]) img[i] = v;
            }
        }
    }
    return img;
}

export function centerOfMass(img: Float32Array, size = MODEL_SIZE): { x: number; y: number; mass: number } {
    let m = 0, sx = 0, sy = 0;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const v = img[r * size + c];
            m += v; sx += v * (c + 0.5); sy += v * (r + 0.5);
        }
    }
    return m > 0 ? { x: sx / m, y: sy / m, mass: m } : { x: size / 2, y: size / 2, mass: 0 };
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

/** Strokes of ONE symbol -> Float32Array(784), layout [1,1,28,28], white ink on black, 0..1. */
export function preprocessGroup(strokes: Stroke[], opts: PreprocessOptions = {}): Float32Array {
    const b = getBounds(strokes);
    if (!b) return new Float32Array(MODEL_SIZE * MODEL_SIZE);

    const size = Math.max(b.xMax - b.xMin, b.yMax - b.yMin);
    const cx = (b.xMin + b.xMax) / 2, cy = (b.yMin + b.yMax) / 2;
    const mid = MODEL_SIZE / 2;
    const width = opts.strokeWidthPx ?? STROKE_WIDTH_PX;

    // Scale by the LONGER side so aspect ratio is preserved (a "1" must not become a "0").
    let scale: number;
    if (size < 1e-6) scale = 1;
    else if (opts.referenceSize && size < SMALL_SYMBOL_RATIO * opts.referenceSize) scale = BOX_SIZE / opts.referenceSize;
    else scale = BOX_SIZE / size;

    const pass1 = rasterize(toSegments(strokes, cx, cy, scale, mid, mid), MODEL_SIZE, width);
    if (!(opts.centerByMass ?? CENTER_BY_MASS)) return pass1;

    const com = centerOfMass(pass1);
    if (com.mass === 0) return pass1;
    const dx = clamp(mid - com.x, MAX_COM_SHIFT), dy = clamp(mid - com.y, MAX_COM_SHIFT);
    return rasterize(toSegments(strokes, cx, cy, scale, mid + dx, mid + dy), MODEL_SIZE, width);
}