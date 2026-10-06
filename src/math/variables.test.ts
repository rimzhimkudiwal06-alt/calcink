import { describe, it, expect } from 'vitest';
import { evaluate, parseAssignment } from './evaluate';
import { processSymbols } from './lineGrouping';
import type { RecognizedSymbol } from '../types';

function sym(
  char: string,
  x: number,
  y: number,
  w: number = 20,
  h: number = 30
): RecognizedSymbol {
  return {
    char,
    bbox: { x, y, w, h },
    confidence: 0.98,
  };
}

describe('Phase 6: Variables & Scope Engine', () => {
  describe('evaluate with variable scope', () => {
    it('evaluates expression with single variable: "x + 5 =" with x = 10 gives 15', () => {
      const scope = { x: 10 };
      const res = evaluate('x + 5 =', scope);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe(15);
      }
    });

    it('handles implicit multiplication: "2x" with x = 7 gives 14', () => {
      const res = evaluate('2x', { x: 7 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe(14);
      }
    });

    it('evaluates powers with variables: "x^2 + 1" with x = 5 gives 26', () => {
      const res = evaluate('x^2 + 1', { x: 5 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe(26);
      }
    });

    it('supports multiple variables: "x * y + z" with x=3, y=4, z=5 gives 17', () => {
      const res = evaluate('x * y + z =', { x: 3, y: 4, z: 5 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe(17);
      }
    });

    it('returns error when evaluating undefined variable', () => {
      const res = evaluate('unknownVar + 10');
      expect(res.ok).toBe(false);
    });

    it('supports standard math functions like sqrt and sin', () => {
      const resSqrt = evaluate('sqrt(x) =', { x: 64 });
      expect(resSqrt.ok).toBe(true);
      if (resSqrt.ok) {
        expect(resSqrt.value).toBe(8);
      }

      const resAbs = evaluate('abs(-42) =');
      expect(resAbs.ok).toBe(true);
      if (resAbs.ok) {
        expect(resAbs.value).toBe(42);
      }
    });
  });

  describe('parseAssignment & sequential scope accumulation', () => {
    it('parses valid variable assignments', () => {
      expect(parseAssignment('x = 10')).toEqual({ variable: 'x', expression: '10' });
      expect(parseAssignment('radius = 5 + 2 =')).toEqual({
        variable: 'radius',
        expression: '5 + 2',
      });
      expect(parseAssignment('18 + 4 =')).toBeNull();
    });

    it('updates scope when evaluate() encounters an assignment', () => {
      const scope: Record<string, number> = {};

      // 1. "x = 10"
      const res1 = evaluate('x = 10', scope);
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.value).toBe(10);
      }
      expect(scope.x).toBe(10);

      // 2. "y = x * 2"
      const res2 = evaluate('y = x * 2', scope);
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.value).toBe(20);
      }
      expect(scope.y).toBe(20);

      // 3. "x + y ="
      const res3 = evaluate('x + y =', scope);
      expect(res3.ok).toBe(true);
      if (res3.ok) {
        expect(res3.value).toBe(30);
      }
    });
  });

  describe('multi-line lineGrouping pipeline with variables', () => {
    it('propagates variable scope across successive equation lines', () => {
      // Line 1: "x = 10"
      // Line 2: "x + 5 ="
      const symbols: RecognizedSymbol[] = [
        // Line 1 (y = 50): x = 10
        sym('x', 20, 50),
        sym('=', 50, 55),
        sym('1', 80, 50),
        sym('0', 100, 50),

        // Line 2 (y = 120): x + 5 =
        sym('x', 20, 120),
        sym('+', 50, 125),
        sym('5', 80, 120),
        sym('=', 110, 125),
      ];

      const results = processSymbols(symbols);
      expect(results.length).toBe(2);

      // Line 1 assigns x = 10
      expect(results[0].displayText).toBe('10');

      // Line 2 evaluates x + 5 = 15!
      expect(results[1].displayText).toBe('15');
      expect(results[1].status).toBe('success');
    });
  });
});
