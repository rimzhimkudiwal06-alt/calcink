import type { Stroke, RecognizedSymbol } from './types';
import { USE_MOCK_RECOGNIZER } from './types';
import { initRecognizer, recognizeInWorker, StaleResultError } from './workerClient';

export { StaleResultError };
export type { Stroke, RecognizedSymbol };

let ready: Promise<unknown> | null = null;

export async function recognize(strokes: Stroke[]): Promise<RecognizedSymbol[]> {
    if (USE_MOCK_RECOGNIZER.value) {
        return [{ char: '1', bbox: { x: 10, y: 10, w: 20, h: 40 }, confidence: 1, strokeIds: strokes.map((s) => s.id) }];
    }
    ready ??= initRecognizer();
    await ready;
    return recognizeInWorker(strokes);
}

/** Wrap a function so it runs 400 ms after the last call (call it after each stroke ends). */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 400) {
    let t: ReturnType<typeof setTimeout> | undefined;
    return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}