import { describe, it, expect } from 'vitest';
import {
  clientToCanvas,
  cssToDevice,
  deviceToCss,
  getCanvasDeviceSize,
} from './coords';

describe('Coordinate Conversion & High-DPI Helpers', () => {
  describe('clientToCanvas', () => {
    it('converts client coordinates to canvas relative coordinates', () => {
      const rect = { left: 100, top: 50 };
      const point = clientToCanvas(150, 90, rect);
      expect(point).toEqual({ x: 50, y: 40 });
    });

    it('handles zero origin correctly', () => {
      const rect = { left: 0, top: 0 };
      const point = clientToCanvas(25, 75, rect);
      expect(point).toEqual({ x: 25, y: 75 });
    });

    it('handles negative or out of bounds coordinates', () => {
      const rect = { left: 100, top: 100 };
      const point = clientToCanvas(80, 50, rect);
      expect(point).toEqual({ x: -20, y: -50 });
    });
  });

  describe('DPR Scaling (1, 1.5, 2, 3)', () => {
    const dprList = [1, 1.5, 2, 3];

    it.each(dprList)('correctly scales cssToDevice with DPR = %s', (dpr) => {
      const cssPx = 100;
      expect(cssToDevice(cssPx, dpr)).toBe(100 * dpr);
    });

    it.each(dprList)('correctly converts deviceToCss with DPR = %s', (dpr) => {
      const devicePx = 300;
      expect(deviceToCss(devicePx, dpr)).toBeCloseTo(300 / dpr, 5);
    });

    it.each(dprList)('calculates physical canvas dimensions with DPR = %s', (dpr) => {
      const cssWidth = 800;
      const cssHeight = 600;
      const result = getCanvasDeviceSize(cssWidth, cssHeight, dpr);

      expect(result.width).toBe(Math.round(800 * dpr));
      expect(result.height).toBe(Math.round(600 * dpr));
      expect(result.dpr).toBe(dpr);
    });

    it('handles fractional pixel rounding gracefully', () => {
      // 333.3 * 1.5 = 499.95 -> 500
      const result = getCanvasDeviceSize(333.3, 111.1, 1.5);
      expect(result.width).toBe(500);
      expect(result.height).toBe(167);
    });

    it('prevents invalid DPR (< 0.1) from causing division by zero or negative size', () => {
      expect(cssToDevice(100, 0)).toBe(10);
      expect(deviceToCss(100, -1)).toBe(1000);
      const size = getCanvasDeviceSize(100, 100, 0);
      expect(size.dpr).toBe(1); // falls back to 1
      expect(size.width).toBe(100);
    });
  });
});
