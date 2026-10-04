import { describe, it, expect } from 'vitest';
import { buildLines, isWellFormed } from '../../src/recognition/postprocess';
import type { RecognizedSymbol } from '../../src/recognition/types';

const sym = (char: string, x: number, conf = 0.95, lineIndex = 0): RecognizedSymbol => ({
    char, confidence: conf, lineIndex, strokeIds: [char + x],
    bbox: { x, y: 0, w: 10, h: 20 },
});
const line = (s: string, conf = 0.95) => [...s].map((c, i) => sym(c, i * 20, conf));

describe('isWellFormed', () => {
    it.each(['18+4×3', '7.5-2', '-3+4', '5×-3', '12÷4'])('accepts %s', (s) => {
        expect(isWellFormed([...s])).toBe(true);
    });
    it.each(['5++3', '+3', '3+', '3..5', '.5', '5.', '1.2.3', '5×÷3'])('rejects %s', (s) => {
        expect(isWellFormed([...s])).toBe(false);
    });
    it('rejects empty input', () => expect(isWellFormed([])).toBe(false));
});

describe('buildLines', () => {
    it('is ready for a complete equation and exposes the "=" symbol', () => {
        const [l] = buildLines(line('18+4×3='));
        expect(l.text).toBe('18+4×3=');
        expect(l.expression).toBe('18+4×3');
        expect(l.ready).toBe(true);
        expect(l.equalsSymbol?.char).toBe('=');
    });

    it('is not ready without "="', () => {
        const [l] = buildLines(line('18+4'));
        expect(l.ready).toBe(false);
        expect(l.malformed).toBe(false);
    });

    it('flags a low-confidence symbol as uncertain and not ready', () => {
        const syms = line('1+1=');
        syms[2].confidence = 0.3;
        const [l] = buildLines(syms);
        expect(l.uncertain).toBe(true);
        expect(l.ready).toBe(false);
    });

    it('flags malformed input without throwing', () => {
        const [l] = buildLines(line('5++3='));
        expect(l.malformed).toBe(true);
        expect(l.ready).toBe(false);
    });

    it('flags "=" that is not last', () => {
        const [l] = buildLines(line('1=2'));
        expect(l.malformed).toBe(true);
    });

    it('sorts symbols left to right even if given out of order', () => {
        const syms = line('1+2=').reverse();
        expect(buildLines(syms)[0].text).toBe('1+2=');
    });

    it('keeps separate lines separate', () => {
        const syms = [...line('1+1='), ...[...'2×3='].map((c, i) => sym(c, i * 20, 0.95, 1))];
        const r = buildLines(syms);
        expect(r.map((l) => l.expression)).toEqual(['1+1', '2×3']);
    });

    it('handles an empty symbol list', () => {
        expect(buildLines([])).toEqual([]);
    });
});