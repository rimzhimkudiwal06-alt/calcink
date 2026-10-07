import type { Stroke, RecognizedSymbol, WorkerMessageRequest, WorkerMessageResponse } from './types';

export class StaleResultError extends Error { }

let worker: Worker | null = null;
let counter = 0;
let latestRecognizeId = '';
const pending = new Map<string, { resolve: (s: RecognizedSymbol[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('../workers/recognizer.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerMessageResponse>) => {
        const { type, requestId, payload } = e.data;
        const p = pending.get(requestId);
        if (!p) return;
        pending.delete(requestId);
        if (type === 'error') p.reject(new Error(payload?.error ?? 'Worker error'));
        else if (requestId !== latestRecognizeId && requestId.startsWith('rec-')) p.reject(new StaleResultError());
        else p.resolve(payload?.symbols ?? []);
    };
    worker.onerror = (e) => {
        for (const p of pending.values()) p.reject(new Error(e.message));
        pending.clear();
    };
    return worker;
}

function send(prefix: string, msg: Omit<WorkerMessageRequest, 'requestId'>): Promise<RecognizedSymbol[]> {
    const requestId = `${prefix}-${++counter}`;
    if (prefix === 'rec') latestRecognizeId = requestId;
    return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        getWorker().postMessage({ ...msg, requestId });
    });
}

export const initRecognizer = () => send('init', { type: 'init', payload: {} });
export const recognizeInWorker = (strokes: Stroke[]) => send('rec', { type: 'recognize', payload: { strokes } });