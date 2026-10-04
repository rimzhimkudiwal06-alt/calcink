import type { RecognizedSymbol } from './types';

export const CONFIDENCE_THRESHOLD = 0.6; // below this a symbol is "uncertain"

const OPS = new Set(['+', '-', '×', '÷']);
const isDigit = (c: string) => c >= '0' && c <= '9';

export interface LineResult {
    lineIndex: number;
    text: string;                    // everything on the line, e.g. "18+4×3="
    expression: string;              // text before the "=", e.g. "18+4×3"
    equalsSymbol?: RecognizedSymbol; // where the answer should be drawn (just right of it)
    uncertain: boolean;              // some symbol had low confidence
    malformed: boolean;              // structurally invalid, e.g. "5++3" or "3..5"
    ready: boolean;                  // safe to evaluate: ends in "=", valid, confident
    symbols: RecognizedSymbol[];
}

/** Does `chars` (no "=") form a plausible expression? Never throws. */
export function isWellFormed(chars: string[]): boolean {
    if (chars.length === 0) return false;
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i], prev = chars[i - 1], next = chars[i + 1];
        if (c === '.') {
            if (!(prev && isDigit(prev) && next && isDigit(next))) return false; // "." between digits only
        } else if (OPS.has(c)) {
            const unary = c === '-' && (i === 0 || OPS.has(prev)); // leading or after an operator: "-3", "5×-3"
            if (!unary && (i === 0 || OPS.has(prev))) return false; // "+3", "5+×3"
            if (i === chars.length - 1) return false;               // trailing operator
        } else if (!isDigit(c)) {
            return false;
        }
    }
    // a number may contain at most one "."
    let dots = 0;
    for (const c of chars) {
        if (c === '.') { if (++dots > 1) return false; }
        else if (OPS.has(c)) dots = 0;
    }
    return true;
}

/** Group symbols by line and build one result per line. */
export function buildLines(symbols: RecognizedSymbol[]): LineResult[] {
    const byLine = new Map<number, RecognizedSymbol[]>();
    for (const s of symbols) {
        const k = s.lineIndex ?? 0;
        if (!byLine.has(k)) byLine.set(k, []);
        byLine.get(k)!.push(s);
    }

    return [...byLine.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lineIndex, raw]) => {
            const syms = [...raw].sort((a, b) => a.bbox.x - b.bbox.x);
            const chars = syms.map((s) => s.char);
            const text = chars.join('');
            const uncertain = syms.some((s) => s.confidence < CONFIDENCE_THRESHOLD);

            const eqIdx = chars.indexOf('=');
            const hasEquals = eqIdx !== -1;
            const equalsLast = hasEquals && eqIdx === chars.length - 1;
            const exprChars = hasEquals ? chars.slice(0, eqIdx) : chars;

            const malformed =
                (hasEquals && !equalsLast) ||           // "=" must be last on its line
                chars.filter((c) => c === '=').length > 1 ||
                (exprChars.length > 0 && !isWellFormed(exprChars));

            return {
                lineIndex,
                text,
                expression: exprChars.join(''),
                equalsSymbol: hasEquals ? syms[eqIdx] : undefined,
                uncertain,
                malformed,
                ready: equalsLast && !malformed && !uncertain && exprChars.length > 0,
                symbols: syms,
            };
        });
}