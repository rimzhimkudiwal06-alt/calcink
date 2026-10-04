import { describe, it, expect } from 'vitest';
import {
  pointToSegmentDistance,
  isPointNearStroke,
  eraseFromStroke,
} from './geometry';
import type { Stroke } from '../types';

describe('Geometry & Hit-Testing', () => {
  describe('pointToSegmentDistance', () => {
    it('computes perpendicular distance to a horizontal segment', () => {
      // Segment from (0, 0) to (10, 0), test point (5, 5)
      const dist = pointToSegmentDistance(5, 5, 0, 0, 10, 0);
      expect(dist).toBeCloseTo(5);
    });

    it('computes distance to endpoint A when projection is before start', () => {
      // Segment from (0, 0) to (10, 0), test point (-3, 4)
      const dist = pointToSegmentDistance(-3, 4, 0, 0, 10, 0);
      expect(dist).toBeCloseTo(5); // hypot(-3, 4)
    });

    it('computes distance to endpoint B when projection is past end', () => {
      // Segment from (0, 0) to (10, 0), test point (13, 4)
      const dist = pointToSegmentDistance(13, 4, 0, 0, 10, 0);
      expect(dist).toBeCloseTo(5); // hypot(3, 4)
    });

    it('handles degenerate 0-length segments', () => {
      const dist = pointToSegmentDistance(3, 4, 0, 0, 0, 0);
      expect(dist).toBeCloseTo(5);
    });
  });

  describe('isPointNearStroke (Stroke Eraser hit testing)', () => {
    const sampleStroke: Stroke = {
      id: 's1',
      points: [
        { x: 10, y: 10, t: 100 },
        { x: 50, y: 10, t: 200 },
        { x: 50, y: 50, t: 300 },
      ],
      width: 4,
    };

    it('returns true when eraser point is right on the line', () => {
      expect(isPointNearStroke({ x: 30, y: 10 }, sampleStroke, 5)).toBe(true);
    });

    it('returns true when eraser circle radius touches the stroke edge', () => {
      // y = 10, stroke half-width = 2, eraser radius = 5 -> hit threshold = 7
      expect(isPointNearStroke({ x: 30, y: 16 }, sampleStroke, 5)).toBe(true);
    });

    it('returns false when eraser is far away', () => {
      expect(isPointNearStroke({ x: 100, y: 100 }, sampleStroke, 5)).toBe(false);
    });

    it('handles single-point strokes correctly', () => {
      const dotStroke: Stroke = {
        id: 'dot1',
        points: [{ x: 20, y: 20, t: 10 }],
        width: 6,
      };
      expect(isPointNearStroke({ x: 22, y: 20 }, dotStroke, 4)).toBe(true);
      expect(isPointNearStroke({ x: 40, y: 40 }, dotStroke, 4)).toBe(false);
    });
  });

  describe('eraseFromStroke (Pixel Eraser partial erase)', () => {
    it('returns the same stroke untouched if eraser does not overlap', () => {
      const stroke: Stroke = {
        id: 's1',
        points: [
          { x: 0, y: 0, t: 1 },
          { x: 100, y: 0, t: 2 },
        ],
        width: 2,
      };
      const result = eraseFromStroke(stroke, { x: 50, y: 80 }, 10);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('s1');
    });

    it('splits a stroke in two when middle is erased', () => {
      const stroke: Stroke = {
        id: 's1',
        points: [
          { x: 0, y: 50, t: 1 },
          { x: 20, y: 50, t: 2 },
          { x: 40, y: 50, t: 3 },
          { x: 60, y: 50, t: 4 },
          { x: 80, y: 50, t: 5 },
          { x: 100, y: 50, t: 6 },
        ],
        width: 2,
      };
      // Eraser at center (50, 50) with radius 15
      const result = eraseFromStroke(stroke, { x: 50, y: 50 }, 15);

      // Should be split into 2 separate stroke fragments
      expect(result.length).toBe(2);
      expect(result[0].points[0].x).toBe(0);
      expect(result[1].points[result[1].points.length - 1].x).toBe(100);
      expect(result[0].id).toContain('s1_split_');
    });

    it('completely removes stroke if eraser covers the entire stroke', () => {
      const stroke: Stroke = {
        id: 's_small',
        points: [
          { x: 10, y: 10, t: 1 },
          { x: 12, y: 12, t: 2 },
        ],
        width: 2,
      };
      const result = eraseFromStroke(stroke, { x: 11, y: 11 }, 20);
      expect(result.length).toBe(0);
    });
  });
});
