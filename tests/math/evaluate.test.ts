import { describe, it, expect } from 'vitest';
import { evaluate, formatResult } from '../../src/math/evaluate';

const val = (s: string) => {
    const r = evaluate(s);
    return 'value' in r ? r.value : r.error;
};

describe('evaluate', () => {
    it('follows BODMAS', () => {
        expect(val('18+4×3')).toBe(30);
        expect(val('2+3×4-5')).toBe(9);
        expect(val('12÷4×3')).toBe(9);
    });

    it('handles multi-digit numbers and decimals', () => {
        expect(val('123+877')).toBe(1000);
        expect(val('7.5-2')).toBe(5.5);
    });

    it('handles negative numbers', () => {
        expect(val('-3+5')).toBe(2);
        expect(val('5×-3')).toBe(-15);
        expect(val('--4')).toBe(4);
    });

    it('reports Undefined for division by zero', () => {
        expect(val('5÷0')).toBe('Undefined');
    });

    it('rejects malformed input without throwing', () => {
        for (const s of ['', '5++3', '3+', '3..5', '.', '×3', '5 5', 'abc']) {
            expect(evaluate(s).ok).toBe(false);
        }
    });

    it('hides floating-point noise when formatting', () => {
        expect(formatResult(0.1 + 0.2)).toBe('0.3');
        expect(formatResult(-0)).toBe('0');
    });
});