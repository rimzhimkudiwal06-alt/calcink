import type { EvalResult } from '../types';

type NumTok = { t: 'num'; v: number };
type OpTok = { t: 'op'; v: '+' | '-' | '*' | '/' };
type Tok = NumTok | OpTok;

class UndefinedError extends Error { }

const OPS: Record<string, OpTok['v']> = {
    '+': '+', '-': '-', '−': '-', '×': '*', '*': '*', '÷': '/', '/': '/',
};

function tokenize(src: string): Tok[] | null {
    const toks: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === ' ') { i++; continue; }
        if ((c >= '0' && c <= '9') || c === '.') {
            let j = i, dots = 0;
            while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
                if (src[j] === '.') dots++;
                j++;
            }
            const text = src.slice(i, j);
            if (dots > 1 || text === '.') return null;
            toks.push({ t: 'num', v: Number(text) });
            i = j;
            continue;
        }
        const op = OPS[c];
        if (!op) return null;
        toks.push({ t: 'op', v: op });
        i++;
    }
    return toks;
}

/** Recursive-descent parser: BODMAS/PEMDAS, decimals, unary minus. No eval(). Never throws. */
export function evaluate(expr: string): EvalResult {
    try {
        const toks = tokenize(expr);
        if (!toks || toks.length === 0) return { ok: false, error: 'Malformed' };
        let pos = 0;

        const isOp = (...ops: string[]) => {
            const k = toks[pos];
            return k !== undefined && k.t === 'op' && ops.includes(k.v);
        };

        const parseExpr = (): number => {
            let v = parseTerm();
            while (isOp('+', '-')) {
                const op = (toks[pos++] as OpTok).v;
                const r = parseTerm();
                v = op === '+' ? v + r : v - r;
            }
            return v;
        };
        const parseTerm = (): number => {
            let v = parseUnary();
            while (isOp('*', '/')) {
                const op = (toks[pos++] as OpTok).v;
                const r = parseUnary();
                if (op === '/') {
                    if (r === 0) throw new UndefinedError();
                    v = v / r;
                } else {
                    v = v * r;
                }
            }
            return v;
        };
        const parseUnary = (): number => {
            if (isOp('-')) { pos++; return -parseUnary(); }
            const k = toks[pos];
            if (!k || k.t !== 'num') throw new Error('Malformed');
            pos++;
            return k.v;
        };

        const value = parseExpr();
        if (pos !== toks.length) return { ok: false, error: 'Malformed' };
        if (!Number.isFinite(value)) return { ok: false, error: 'Undefined' };
        return { ok: true, value };
    } catch (e) {
        return { ok: false, error: e instanceof UndefinedError ? 'Undefined' : 'Malformed' };
    }
}

/** 0.1+0.2 -> "0.3" (10 significant digits hides floating-point noise). */
export function formatResult(value: number): string {
    return Number(value.toPrecision(10)).toString();
}