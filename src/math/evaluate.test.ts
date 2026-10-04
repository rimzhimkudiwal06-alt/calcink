import { describe, it, expect } from 'vitest';
import { evaluate, formatResult, cleanFloat } from './evaluate';

describe('Math Engine (evaluate)', () => {
  describe('Operator Precedence (BODMAS / PEMDAS)', () => {
    it('evaluates multiplication before addition (2 + 3 * 4 = 14)', () => {
      const res = evaluate('2 + 3 * 4');
      expect(res).toEqual({ ok: true, value: 14 });
    });

    it('evaluates unicode multiplication symbol (18 + 4 × 3 = 30)', () => {
      const res = evaluate('18 + 4 × 3');
      expect(res).toEqual({ ok: true, value: 30 });
    });

    it('evaluates division before subtraction (20 - 10 / 2 = 15)', () => {
      const res = evaluate('20 - 10 / 2');
      expect(res).toEqual({ ok: true, value: 15 });
    });

    it('evaluates unicode division symbol (20 ÷ 4 + 3 = 8)', () => {
      const res = evaluate('20 ÷ 4 + 3');
      expect(res).toEqual({ ok: true, value: 8 });
    });

    it('respects parenthesized sub-expressions ((2 + 3) * 4 = 20)', () => {
      const res = evaluate('(2 + 3) * 4');
      expect(res).toEqual({ ok: true, value: 20 });
    });
  });

  describe('Left Associativity', () => {
    it('evaluates subtraction strictly left-to-right (10 - 3 - 2 = 5, not 9)', () => {
      const res = evaluate('10 - 3 - 2');
      expect(res).toEqual({ ok: true, value: 5 });
    });

    it('evaluates division strictly left-to-right (24 / 4 / 2 = 3, not 12)', () => {
      const res = evaluate('24 / 4 / 2');
      expect(res).toEqual({ ok: true, value: 3 });
    });

    it('evaluates mixed operators left-to-right at same precedence level', () => {
      const res = evaluate('100 / 10 * 2');
      expect(res).toEqual({ ok: true, value: 20 });
    });
  });

  describe('Decimals & Floating Point Precision', () => {
    it('evaluates standard decimal addition and multiplication', () => {
      expect(evaluate('0.5 + 0.25')).toEqual({ ok: true, value: 0.75 });
      expect(evaluate('1.5 * 2.5')).toEqual({ ok: true, value: 3.75 });
    });

    it('supports leading-dot decimals (.5 * 4 = 2)', () => {
      expect(evaluate('.5 * 4')).toEqual({ ok: true, value: 2 });
    });

    it('eliminates IEEE-754 binary floating-point noise (0.1 + 0.2 = 0.3)', () => {
      const res = evaluate('0.1 + 0.2');
      expect(res).toEqual({ ok: true, value: 0.3 });
      expect(formatResult(res.ok ? res.value : 0)).toBe('0.3');
    });

    it('eliminates noise for 0.7 + 0.1 (= 0.8)', () => {
      const res = evaluate('0.7 + 0.1');
      expect(res).toEqual({ ok: true, value: 0.8 });
    });
  });

  describe('Negatives & Unary Minus', () => {
    it('evaluates leading unary minus (-3 + 5 = 2)', () => {
      expect(evaluate('-3 + 5')).toEqual({ ok: true, value: 2 });
    });

    it('evaluates unary minus after multiplication (4 × -2 = -8)', () => {
      expect(evaluate('4 × -2')).toEqual({ ok: true, value: -8 });
      expect(evaluate('4 * -2')).toEqual({ ok: true, value: -8 });
    });

    it('evaluates double minus as addition (5 - -3 = 8)', () => {
      expect(evaluate('5 - -3')).toEqual({ ok: true, value: 8 });
    });

    it('evaluates consecutive unary minus signs (--7 = 7)', () => {
      expect(evaluate('--7')).toEqual({ ok: true, value: 7 });
      expect(evaluate('- - 5 + 3')).toEqual({ ok: true, value: 8 });
    });

    it('handles unary plus correctly (+3 + +5 = 8)', () => {
      expect(evaluate('+3 + +5')).toEqual({ ok: true, value: 8 });
    });
  });

  describe('Division by Zero', () => {
    it('returns { ok: false, error: "Undefined" } for integer zero division', () => {
      expect(evaluate('10 / 0')).toEqual({ ok: false, error: 'Undefined' });
      expect(evaluate('10 ÷ 0')).toEqual({ ok: false, error: 'Undefined' });
    });

    it('returns { ok: false, error: "Undefined" } for 0 / 0', () => {
      expect(evaluate('0 / 0')).toEqual({ ok: false, error: 'Undefined' });
    });

    it('returns { ok: false, error: "Undefined" } for calculated zero divisor (4 / (2 - 2))', () => {
      expect(evaluate('4 / (2 - 2)')).toEqual({ ok: false, error: 'Undefined' });
    });
  });

  describe('Trailing Equals (=) & Whitespace Handling', () => {
    it('ignores optional trailing "=" sign with or without spaces', () => {
      expect(evaluate('18 + 4 × 3 =')).toEqual({ ok: true, value: 30 });
      expect(evaluate('18+4*3=')).toEqual({ ok: true, value: 30 });
      expect(evaluate('5 + 5 = ')).toEqual({ ok: true, value: 10 });
    });

    it('ignores arbitrary tabs, spaces, and newlines', () => {
      expect(evaluate('  18   +  4  *   3  ')).toEqual({ ok: true, value: 30 });
      expect(evaluate('\t 10 + 20 \n')).toEqual({ ok: true, value: 30 });
    });

    it('rejects "=" signs appearing in the middle of expression', () => {
      expect(evaluate('5 = 5')).toEqual({ ok: false, error: 'Syntax error' });
      expect(evaluate('2 + = 3')).toEqual({ ok: false, error: 'Syntax error' });
    });
  });

  describe('Malformed Inputs (Never throws exceptions)', () => {
    const invalidInputs = [
      '3++',
      '5×',
      '5*',
      '',
      '   ',
      '1.2.3',
      '×5',
      '*10',
      '/4',
      '÷2',
      '++',
      '--',
      'abc',
      '+',
      '-',
      '.',
      '..',
      '()',
      '5 + ()',
      '(5 + 2',
      '5 + 2)',
    ];

    it.each(invalidInputs)('safely returns Syntax error for malformed input: "%s"', (input) => {
      expect(() => {
        const res = evaluate(input);
        expect(res).toEqual({ ok: false, error: 'Syntax error' });
      }).not.toThrow();
    });

    it('safely handles non-string arguments', () => {
      // @ts-expect-error Testing invalid runtime input
      expect(evaluate(null)).toEqual({ ok: false, error: 'Syntax error' });
      // @ts-expect-error Testing invalid runtime input
      expect(evaluate(undefined)).toEqual({ ok: false, error: 'Syntax error' });
    });
  });

  describe('Large Numbers & Formatting', () => {
    it('evaluates large integers accurately', () => {
      expect(evaluate('1000000 * 1000000')).toEqual({ ok: true, value: 1000000000000 });
    });

    it('handles negative zero normalization', () => {
      expect(cleanFloat(-0)).toBe(0);
      expect(evaluate('0 * -1')).toEqual({ ok: true, value: 0 });
    });

    it('formats results into clean human-readable strings', () => {
      expect(formatResult(42)).toBe('42');
      expect(formatResult(0.3)).toBe('0.3');
      expect(formatResult(12345678)).toBe('12345678');
    });
  });
});
