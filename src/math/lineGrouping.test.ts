import { describe, it, expect } from 'vitest';
import type { RecognizedSymbol } from '../types';
import {
  isVerticallyAligned,
  groupSymbolsIntoLines,
  extractEquationFromLine,
  calculateAnswerPlacement,
  processSymbols,
  isValidSymbol,
  MIN_SYMBOL_CONFIDENCE,
} from './lineGrouping';

// Helper to create mock RecognizedSymbol
function sym(
  char: string,
  x: number,
  y: number,
  w: number = 20,
  h: number = 30,
  confidence: number = 0.98
): RecognizedSymbol {
  return {
    char,
    bbox: { x, y, w, h },
    confidence,
  };
}

describe('lineGrouping & equation extractor', () => {
  describe('isVerticallyAligned', () => {
    it('returns true when symbol midpoint is within line bounds', () => {
      // Line is from y=100 to y=140 (height 40)
      // Symbol is from y=110 to y=130 (midpoint 120)
      expect(isVerticallyAligned(100, 140, 110, 20)).toBe(true);
    });

    it('returns true when symbol substantially overlaps with line', () => {
      // Line: 100 to 140. Symbol: 120 to 160 (overlap: 120..140 = 20px, height = 40px, 50% overlap)
      expect(isVerticallyAligned(100, 140, 120, 40)).toBe(true);
    });

    it('returns false for vertically distant symbols', () => {
      // Line 1: 100 to 140. Symbol: 220 to 260
      expect(isVerticallyAligned(100, 140, 220, 40)).toBe(false);
    });
  });

  describe('groupSymbolsIntoLines', () => {
    it('returns empty array when symbols list is empty', () => {
      expect(groupSymbolsIntoLines([])).toEqual([]);
    });

    it('sorts symbols within a single line left to right', () => {
      // Input out of order: '8', '+', '1', '=', '4'
      const unordered: RecognizedSymbol[] = [
        sym('8', 50, 100),
        sym('+', 80, 105, 20, 20), // smaller height, vertically centered
        sym('1', 20, 100),
        sym('=', 150, 110, 20, 10),
        sym('4', 110, 100),
      ];

      const lines = groupSymbolsIntoLines(unordered);
      expect(lines.length).toBe(1);

      const chars = lines[0].map((s) => s.char);
      expect(chars).toEqual(['1', '8', '+', '4', '=']);
    });

    it('separates symbols on distinct lines and sorts lines top to bottom', () => {
      // Line 2 (y=200): '2', '+', '2', '='
      // Line 1 (y=50):  '1', '+', '1', '='
      const symbols: RecognizedSymbol[] = [
        sym('2', 20, 200),
        sym('+', 50, 205),
        sym('2', 80, 200),
        sym('=', 110, 205),

        sym('1', 20, 50),
        sym('+', 50, 55),
        sym('1', 80, 50),
        sym('=', 110, 55),
      ];

      const lines = groupSymbolsIntoLines(symbols);
      expect(lines.length).toBe(2);

      const line1Chars = lines[0].map((s) => s.char);
      const line2Chars = lines[1].map((s) => s.char);

      expect(line1Chars).toEqual(['1', '+', '1', '=']);
      expect(line2Chars).toEqual(['2', '+', '2', '=']);
    });
  });

  describe('extractEquationFromLine', () => {
    it('returns null if line has no equals sign', () => {
      const line = [sym('1', 10, 50), sym('+', 30, 50), sym('2', 50, 50)];
      expect(extractEquationFromLine(line)).toBeNull();
    });

    it('returns null if equals sign is the first character with no preceding symbols', () => {
      const line = [sym('=', 10, 50), sym('5', 30, 50)];
      expect(extractEquationFromLine(line)).toBeNull();
    });

    it('extracts expression string before terminal equals', () => {
      const line = [
        sym('1', 10, 50),
        sym('8', 30, 50),
        sym('+', 50, 55),
        sym('4', 70, 50),
        sym('×', 90, 55),
        sym('3', 110, 50),
        sym('=', 130, 55),
      ];

      const res = extractEquationFromLine(line);
      expect(res).not.toBeNull();
      expect(res?.expression).toBe('18+4×3');
      expect(res?.equalsSymbol.char).toBe('=');
      expect(res?.precedingSymbols.length).toBe(6);
    });

    it('identifies the terminal equals when multiple equals are present', () => {
      // e.g. accidental extra equals sign
      const line = [
        sym('5', 10, 50),
        sym('=', 30, 50),
        sym('5', 50, 50),
        sym('=', 70, 50),
      ];

      const res = extractEquationFromLine(line);
      expect(res).not.toBeNull();
      expect(res?.equalsSymbol.bbox.x).toBe(70);
      expect(res?.expression).toBe('5=5');
    });
  });

  describe('calculateAnswerPlacement', () => {
    it('calculates position to the right of equals with proportional font size', () => {
      const preceding = [sym('1', 10, 100, 20, 40), sym('+', 35, 100, 20, 40), sym('2', 60, 100, 20, 40)];
      const equals = sym('=', 85, 105, 20, 20);

      const placement = calculateAnswerPlacement(preceding, equals);

      // x must be strictly to the right of equals (x > 85 + 20)
      expect(placement.x).toBeGreaterThan(105);
      // fontSize must be bounded reasonably
      expect(placement.fontSize).toBeGreaterThanOrEqual(18);
      expect(placement.fontSize).toBeLessThanOrEqual(60);
      // baselineY must be close to the equals vertical area
      expect(placement.baselineY).toBeGreaterThan(100);
      expect(placement.baselineY).toBeLessThan(150);
    });
  });

  describe('processSymbols (end-to-end pipeline)', () => {
    it('evaluates single expression 18+4×3= to 30 with success status', () => {
      const symbols: RecognizedSymbol[] = [
        sym('1', 100, 150, 20, 40),
        sym('8', 125, 150, 20, 40),
        sym('+', 150, 160, 20, 20),
        sym('4', 175, 150, 20, 40),
        sym('×', 200, 160, 20, 20),
        sym('3', 225, 150, 20, 40),
        sym('=', 250, 160, 20, 20),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(1);

      const r = results[0];
      expect(r.expression).toBe('18+4×3');
      expect(r.displayText).toBe('30');
      expect(r.status).toBe('success');
      expect(r.evalResult.ok).toBe(true);
      expect(r.x).toBeGreaterThan(270);
    });

    it('handles division by zero by outputting "Undefined"', () => {
      const symbols: RecognizedSymbol[] = [
        sym('1', 50, 100),
        sym('0', 75, 100),
        sym('÷', 100, 105),
        sym('0', 125, 100),
        sym('=', 150, 105),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(1);
      expect(results[0].displayText).toBe('Undefined');
      expect(results[0].status).toBe('undefined');
    });

    it('handles syntax errors by displaying subtle "?"', () => {
      const symbols: RecognizedSymbol[] = [
        sym('5', 50, 100),
        sym('+', 75, 105),
        sym('×', 100, 105),
        sym('=', 125, 105),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(1);
      expect(results[0].displayText).toBe('?');
      expect(results[0].status).toBe('syntax-error');
    });

    it('evaluates multiple independent equations across lines simultaneously', () => {
      const symbols: RecognizedSymbol[] = [
        // Line 1 (y=50): 10 / 2 = 5
        sym('1', 50, 50),
        sym('0', 70, 50),
        sym('/', 90, 50),
        sym('2', 110, 50),
        sym('=', 130, 55),

        // Line 2 (y=150): 7 * 6 = 42
        sym('7', 50, 150),
        sym('*', 70, 155),
        sym('6', 90, 150),
        sym('=', 110, 155),

        // Line 3 (y=250): 8 - 3 (no equals, should be skipped)
        sym('8', 50, 250),
        sym('-', 70, 255),
        sym('3', 90, 250),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(2);

      expect(results[0].expression).toBe('10/2');
      expect(results[0].displayText).toBe('5');
      expect(results[0].status).toBe('success');

      expect(results[1].expression).toBe('7*6');
      expect(results[1].displayText).toBe('42');
      expect(results[1].status).toBe('success');
    });

    it('cleans floating point arithmetic (0.1 + 0.2 = 0.3)', () => {
      const symbols: RecognizedSymbol[] = [
        sym('0', 20, 100),
        sym('.', 35, 115, 10, 10),
        sym('1', 50, 100),
        sym('+', 75, 105),
        sym('0', 100, 100),
        sym('.', 115, 115, 10, 10),
        sym('2', 130, 100),
        sym('=', 155, 105),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(1);
      expect(results[0].displayText).toBe('0.3');
      expect(results[0].status).toBe('success');
    });

    it('filters out noisy symbols with confidence < 0.4 or malformed bounding boxes', () => {
      const symbols: RecognizedSymbol[] = [
        // Low confidence noise (< 0.40)
        sym('9', 10, 100, 20, 40, 0.25),
        // Invalid bbox (NaN or non-positive dimension)
        { char: '7', bbox: { x: NaN, y: 100, w: 20, h: 40 }, confidence: 0.9 },
        { char: '3', bbox: { x: 50, y: 100, w: 0, h: 40 }, confidence: 0.9 },
        // Empty character
        sym(' ', 80, 100, 20, 40, 0.9),
        // Valid equation: 5 + 5 =
        sym('5', 100, 100, 20, 40, 0.95),
        sym('+', 125, 105, 20, 20, 0.95),
        sym('5', 150, 100, 20, 40, 0.95),
        sym('=', 175, 105, 20, 20, 0.95),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(1);
      expect(results[0].expression).toBe('5+5');
      expect(results[0].displayText).toBe('10');
      expect(results[0].status).toBe('success');
    });
  });

  describe('isValidSymbol', () => {
    it('returns true for valid symbols with confidence >= MIN_SYMBOL_CONFIDENCE', () => {
      expect(isValidSymbol(sym('4', 10, 20, 30, 40, MIN_SYMBOL_CONFIDENCE))).toBe(true);
      expect(isValidSymbol(sym('+', 10, 20, 30, 40, 0.99))).toBe(true);
    });

    it('returns false for confidence lower than MIN_SYMBOL_CONFIDENCE', () => {
      expect(isValidSymbol(sym('4', 10, 20, 30, 40, 0.39))).toBe(false);
      expect(isValidSymbol(sym('4', 10, 20, 30, 40, 0.1))).toBe(false);
    });

    it('returns false for empty or whitespace chars', () => {
      expect(isValidSymbol(sym('', 10, 20, 30, 40, 0.9))).toBe(false);
      expect(isValidSymbol(sym('   ', 10, 20, 30, 40, 0.9))).toBe(false);
    });

    it('returns false for non-finite or non-positive bounding box dimensions', () => {
      expect(isValidSymbol({ char: '1', bbox: { x: Infinity, y: 0, w: 10, h: 10 }, confidence: 0.9 })).toBe(false);
      expect(isValidSymbol({ char: '1', bbox: { x: 0, y: NaN, w: 10, h: 10 }, confidence: 0.9 })).toBe(false);
      expect(isValidSymbol({ char: '1', bbox: { x: 0, y: 0, w: -5, h: 10 }, confidence: 0.9 })).toBe(false);
      expect(isValidSymbol({ char: '1', bbox: { x: 0, y: 0, w: 10, h: 0 }, confidence: 0.9 })).toBe(false);
    });
  });
});
