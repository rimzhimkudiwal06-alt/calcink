import { describe, it, expect } from 'vitest';
import { preprocessGroup, centerOfMass, MODEL_SIZE } from '../../src/recognition/preprocess';
import type { Stroke } from '../../src/recognition/types';

const line = (x0: number, y0: number, x1: number, y1: number, id = 's', n = 50): Stroke => ({
    id, width: 4,
    points: Array.from({ length: n }, (_, i) => {
        const k = i / (n - 1);
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, t: i * 5 };
    }),
});

const colsWithInk = (img: Float32Array) => {
    let n = 0;
    for (let c = 0; c < MODEL_SIZE; c++) {
        for (let r = 0; r < MODEL_SIZE; r++) if (img[r * MODEL_SIZE + c] > 0.5) { n++; break; }
    }
    return n;
};
const rowsWithInk = (img: Float32Array) => {
    let n = 0;
    for (let r = 0; r < MODEL_SIZE; r++) {
        for (let c = 0; c < MODEL_SIZE; c++) if (img[r * MODEL_SIZE + c] > 0.5) { n++; break; }
    }
    return n;
};

describe('preprocessGroup', () => {
    it('returns a 784-length tensor with values in [0,1]', () => {
        const t = preprocessGroup([line(0, 0, 100, 0)]);
        expect(t.length).toBe(784);
        expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...t)).toBeLessThanOrEqual(1);
        expect(Math.max(...t)).toBeGreaterThan(0.99);
    });

    it('returns all zeros (no throw) for empty input', () => {
        const t = preprocessGroup([]);
        expect(t.every((v) => v === 0)).toBe(true);
    });

    it('centres a horizontal bar', () => {
        const com = centerOfMass(preprocessGroup([line(0, 0, 100, 0)]));
        expect(com.x).toBeCloseTo(14, 1);
        expect(com.y).toBeCloseTo(14, 1);
    });

    it('preserves aspect ratio: a tall line stays thin', () => {
        const t = preprocessGroup([line(0, 0, 0, 100)]);
        expect(colsWithInk(t)).toBeLessThanOrEqual(4);
        expect(rowsWithInk(t)).toBeGreaterThanOrEqual(18);
    });

    it('is translation and scale invariant', () => {
        const L = [line(0, 0, 0, 80, 'a'), line(0, 80, 50, 80, 'b')];
        const moved = [line(500, 300, 500, 540, 'a'), line(500, 540, 650, 540, 'b')]; // x3 and shifted
        const a = preprocessGroup(L), b = preprocessGroup(moved);
        for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 4);
    });

    it('draws a single tap as a finite blob', () => {
        const t = preprocessGroup([{ id: 'd', width: 4, points: [{ x: 5, y: 5, t: 0 }] }]);
        expect(t.every(Number.isFinite)).toBe(true);
        expect(Math.max(...t)).toBeGreaterThan(0.5);
    });

    it('keeps a small stroke small when referenceSize is given', () => {
        const t = preprocessGroup([line(0, 0, 4, 0, 'dot', 5)], { referenceSize: 40 });
        expect(colsWithInk(t)).toBeLessThanOrEqual(6);
    });
});