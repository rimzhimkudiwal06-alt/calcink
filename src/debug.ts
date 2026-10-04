/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
import { recognize, debounce, StaleResultError } from './recognition/index';
import { segmentStrokes } from './recognition/segment';
import { preprocessGroup } from './recognition/preprocess';
import type { Stroke } from './recognition/types';

const pad = document.getElementById('pad') as HTMLCanvasElement;
const preview = document.getElementById('preview') as HTMLCanvasElement;
const out = document.getElementById('out') as HTMLPreElement;
const ctx = pad.getContext('2d')!;
ctx.lineWidth = 4;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

let strokes: Stroke[] = [];
let current: Stroke | null = null;
let n = 0;

function redraw() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    for (const s of strokes) {
        ctx.beginPath();
        s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
        ctx.stroke();
    }
}

function pos(e: PointerEvent) {
    const r = pad.getBoundingClientRect();
    return {
        x: ((e.clientX - r.left) * pad.width) / r.width,
        y: ((e.clientY - r.top) * pad.height) / r.height,
        t: performance.now(),
    };
}

const run = debounce(async () => {
    if (!strokes.length) { out.textContent = 'Draw something...'; return; }
    try {
        out.textContent = 'Recognizing...';
        const symbols = await recognize(strokes);
        out.textContent =
            'Expression: ' + symbols.map((s) => s.char).join(' ') + '\n\n' +
            symbols.map((s, i) =>
                `#${i} "${s.char}"  conf ${s.confidence.toFixed(2)}\n   top3: ` +
                (s.top3 ?? []).map((c) => `${c.char} ${c.score.toFixed(2)}`).join(', ')
            ).join('\n');

        // show exactly what the model sees for the last symbol
        const groups = segmentStrokes(strokes);
        const last = groups[groups.length - 1];
        if (last) {
            const t = preprocessGroup(last.strokes);
            const pctx = preview.getContext('2d')!;
            const img = pctx.createImageData(28, 28);
            for (let i = 0; i < 784; i++) {
                const v = Math.round(t[i] * 255);
                img.data.set([v, v, v, 255], i * 4);
            }
            pctx.putImageData(img, 0, 0);
        }
    } catch (e) {
        if (!(e instanceof StaleResultError)) out.textContent = 'Error: ' + (e as Error).message;
    }
});

pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    current = { id: 's' + ++n, width: 4, points: [pos(e)] };
    strokes.push(current);
    redraw();
});
pad.addEventListener('pointermove', (e) => {
    if (!current) return;
    current.points.push(pos(e));
    redraw();
});
const end = () => { if (current) { current = null; run(); } };
pad.addEventListener('pointerup', end);
pad.addEventListener('pointercancel', end);

document.getElementById('clear')!.onclick = () => { strokes = []; redraw(); run(); };
document.getElementById('undo')!.onclick = () => { strokes.pop(); redraw(); run(); };