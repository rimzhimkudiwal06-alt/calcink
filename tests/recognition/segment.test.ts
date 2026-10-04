import { describe, it, expect } from 'vitest';
import { segmentStrokes } from '../../src/recognition/segment';
import type { Stroke } from '../../src/recognition/types';

const line = (id: string, x0: number, y0: number, x1: number, y1: number, t0 = 0, n = 10): Stroke => ({
    id, width: 4,
    points: Array.from({ length: n }, (_, i) => {
        const k = i / (n - 1);
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, t: t0 + i * 5 };
    }),
});
const tap = (id: string, x: number, y: number, t0: number): Stroke => ({
    id, width: 4, points: [{ x, y, t: t0 }],
});
const ids = (g: { strokes: Stroke[] }) => g.strokes.map((s) => s.id).sort();

describe('segmentStrokes', () => {
    it('merges a two-stroke "2" (loop + tail) but keeps "12" as two symbols', () => {
        const g = segmentStrokes([
            line('one', 0, 0, 0, 40, 0),
            line('loop', 20, 0, 40, 18, 300),
            line('tail', 22, 14, 42, 40, 450),
        ]);
        expect(g).toHaveLength(2);
    });

    it('groups a lone "÷" (bar + two dots, nothing else) into one symbol', () => {
        const g = segmentStrokes([line('bar', 0, 20, 60, 20, 0), tap('d1', 30, 5, 100), tap('d2', 30, 35, 200)]);
        expect(g).toHaveLength(1);
    });

    it('returns [] for empty input', () => {
        expect(segmentStrokes([])).toEqual([]);
    });

    it('merges two stacked bars into "="', () => {
        const g = segmentStrokes([line('b1', 0, 0, 40, 0, 0), line('b2', 0, 12, 40, 12, 300)]);
        expect(g).toHaveLength(1);
    });

    it('merges crossing strokes into "+"', () => {
        const g = segmentStrokes([line('h', 0, 20, 40, 20, 0), line('v', 20, 0, 20, 40, 100)]);
        expect(g).toHaveLength(1);
    });

    it('keeps two nearby "1"s separate even if drawn quickly', () => {
        const g = segmentStrokes([line('a', 0, 0, 0, 40, 0), line('b', 15, 0, 15, 40, 200)]);
        expect(g).toHaveLength(2);
    });

    it('keeps slightly overlapping slanted digits separate', () => {
        const g = segmentStrokes([line('a', 0, 0, 10, 40, 0), line('b', 8, 0, 18, 40, 200)]);
        expect(g).toHaveLength(2);
    });

    it('groups a bar and two dots into "÷"', () => {
        const g = segmentStrokes([
            line('bar', 0, 20, 40, 20, 0), tap('d1', 20, 5, 100), tap('d2', 20, 35, 200),
            line('digit', 100, 0, 100, 40, 1000),
        ]);
        expect(g).toHaveLength(2);
        expect(g.find((x) => x.strokes.length === 3)).toBeDefined();
    });

    it('merges a two-stroke "5" (body + top bar)', () => {
        const g = segmentStrokes([line('bar', 0, 0, 25, 0, 0), line('body', 2, 4, 24, 36, 200)]);
        expect(g).toHaveLength(1);
    });

    it('separates two lines and assigns lineIndex', () => {
        const g = segmentStrokes([line('a', 0, 0, 0, 40, 0), line('b', 0, 80, 0, 120, 2000)]);
        expect(g.map((x) => x.lineIndex)).toEqual([0, 1]);
    });

    it('handles out-of-order strokes and sorts left to right', () => {
        const g = segmentStrokes([
            line('b2', 0, 12, 40, 12, 300), line('digit', 100, -20, 100, 20, 1000), line('b1', 0, 0, 40, 0, 0),
        ]);
        expect(g).toHaveLength(2);
        expect(ids(g[0])).toEqual(['b1', 'b2']);
    });
});