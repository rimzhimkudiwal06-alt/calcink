import { recognize, debounce, StaleResultError } from './index';
import { buildLines, type LineResult } from './postprocess';
import { evaluate, formatResult } from '../math/evaluate';
import type { Stroke } from '../types';

interface StrokeSource {
    onStrokesChanged(cb: (strokes: Stroke[]) => void): () => void;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Connects the drawing canvas to the recognition engine:
 * strokes -> recognize -> buildLines -> evaluate -> answer drawn right of the "=".
 * Answers live in a separate overlay, so they never become strokes (no undo, no re-recognition).
 */
export function attachRecognition(source: StrokeSource, canvas: HTMLCanvasElement, delayMs = 400): () => void {
    console.log('[CalcInk] attachRecognition mounted');
    const host = canvas.parentElement as HTMLElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;';
    host.appendChild(overlay);

    const place = () => {
        overlay.style.left = `${canvas.offsetLeft}px`;
        overlay.style.top = `${canvas.offsetTop}px`;
        overlay.style.width = `${canvas.clientWidth}px`;
        overlay.style.height = `${canvas.clientHeight}px`;
    };

    const showAnswer = (line: LineResult) => {
        const eq = line.equalsSymbol;
        if (!eq) return;

        let text: string;
        let muted = false;
        if (line.ready) {
            const r = evaluate(line.expression);
            if ('value' in r) {
                text = formatResult(r.value);
            } else {
                const undef = r.error === 'Undefined';
                text = undef ? 'Undefined' : '?';
                muted = !undef;
            }
        } else if (line.malformed || line.uncertain) {
            text = '?';
            muted = true;
        } else {
            return;
        }

        // "=" is shorter than digits, so size the answer from the other symbols on the line
        const hs = line.symbols.filter((s) => !'=-.'.includes(s.char)).map((s) => s.bbox.h);
        const size = Math.max(16, Math.min(72, hs.length ? median(hs) : eq.bbox.h * 3));

        const el = document.createElement('div');
        el.textContent = text;
        el.dataset.lineIndex = String(line.lineIndex);
        el.style.cssText =
            `position:absolute;white-space:nowrap;font:600 ${size}px system-ui,sans-serif;` +
            `left:${eq.bbox.x + eq.bbox.w + 10}px;top:${eq.bbox.y + eq.bbox.h / 2}px;` +
            `transform:translateY(-50%);color:${muted ? '#94a3b8' : '#2563eb'};`;
        overlay.appendChild(el);
    };

    let latest: Stroke[] = [];
    let stamp = 0; // bumped on every change, so results from old strokes are dropped

    const run = debounce(async () => {
        const mine = stamp;
        console.log('[CalcInk] run fired, strokes:', latest.length);
        if (!latest.length) { overlay.replaceChildren(); return; }
        try {
            const symbols = await recognize(latest);
            console.log('[CalcInk] symbols:', symbols.map((s) => s.char).join(''), buildLines(symbols));
            if (mine !== stamp) return;
            place();
            overlay.replaceChildren();
            buildLines(symbols).forEach(showAnswer);
        } catch (e) {
            if (!(e instanceof StaleResultError)) console.error('[CalcInk] recognition failed', e);
        }
    }, delayMs);

    const unsubscribe = source.onStrokesChanged((strokes) => {
        latest = strokes;
        stamp++;
        if (!strokes.length) overlay.replaceChildren();
        run();
    });

    return () => { unsubscribe(); overlay.remove(); };
}