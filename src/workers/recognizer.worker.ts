/// <reference types="vite/client" />
import * as ort from 'onnxruntime-web/wasm';
import ortMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import { segmentStrokes, type StrokeGroup } from '../recognition/segment';
import { preprocessGroup } from '../recognition/preprocess';
import { classifyCascade } from '../recognition/classifier';
import type { WorkerMessageRequest, WorkerMessageResponse, RecognizedSymbol } from '../recognition/types';

let opSession: ort.InferenceSession | null = null;
let digitSession: ort.InferenceSession | null = null;

const post = (m: WorkerMessageResponse) => (self as unknown as Worker).postMessage(m);

async function init(p: NonNullable<WorkerMessageRequest['payload']>) {
    ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
    ort.env.wasm.numThreads = 1; // single thread: no COOP/COEP headers needed
    const opts = { executionProviders: ['wasm'] };
    opSession = await ort.InferenceSession.create(p.modelOPath ?? '/models/operators.onnx', opts);
    digitSession = await ort.InferenceSession.create(p.modelDPath ?? '/models/mnist-8.onnx', opts);
    const blank = new Float32Array(784); // warm-up so the first real call isn't slow
    await classifyCascade(ort, opSession, digitSession, blank);
}

const ENABLE_DOT_HEURISTIC = true; // the ONE non-model rule: disclose in README
const DOT_ABS_PX = 10;             // a single stroke this small is a dot
const DOT_REL = 0.2;               // ...or tiny compared to the biggest symbol

async function recognize(strokes: NonNullable<WorkerMessageRequest['payload']>['strokes']): Promise<RecognizedSymbol[]> {
    if (!opSession || !digitSession) throw new Error('Models not initialised');
    const groups = segmentStrokes(strokes ?? []);
    const sizeOf = (g: StrokeGroup) => Math.max(g.bbox.w, g.bbox.h);
    const maxSize = groups.length ? Math.max(...groups.map(sizeOf)) : 0;

    const isDot = (g: StrokeGroup) => {
        if (!ENABLE_DOT_HEURISTIC || g.strokes.length !== 1) return false;
        const w = g.bbox.w, h = g.bbox.h;
        const roughlySquare = Math.min(w, h) >= 0.4 * Math.max(w, h); // a short "-" is not a dot
        return roughlySquare && (sizeOf(g) <= DOT_ABS_PX || sizeOf(g) <= DOT_REL * maxSize);
    };

    const bigSizes = groups.filter((g) => !isDot(g)).map(sizeOf).sort((a, b) => a - b);
    const referenceSize = bigSizes.length ? bigSizes[Math.floor(0.75 * (bigSizes.length - 1))] : undefined;

    const out: RecognizedSymbol[] = [];
    for (const g of groups) {
        const base = {
            bbox: { x: g.bbox.x, y: g.bbox.y, w: g.bbox.w, h: g.bbox.h },
            strokeIds: g.strokes.map((s) => s.id),
            lineIndex: g.lineIndex,
        };
        if (isDot(g)) {
            out.push({ ...base, char: '.', confidence: 1, top3: [{ char: '.', score: 1 }] });
            continue;
        }
        const tensor = preprocessGroup(g.strokes, { referenceSize });
        const r = await classifyCascade(ort, opSession, digitSession, tensor);
        out.push({ ...base, char: r.char, confidence: r.confidence, top3: r.top3 });
    }
    return out;
}

self.onmessage = async (e: MessageEvent<WorkerMessageRequest>) => {
    const { type, requestId, payload } = e.data;
    try {
        if (type === 'init') {
            await init(payload ?? {});
            post({ type: 'result', requestId, payload: { symbols: [] } });
        } else if (type === 'recognize') {
            const symbols = await recognize(payload?.strokes);
            post({ type: 'result', requestId, payload: { symbols } });
        }
    } catch (err) {
        post({ type: 'error', requestId, payload: { error: err instanceof Error ? err.message : String(err) } });
    }
};