import type * as ort from 'onnxruntime-web';
import type { PredictionCandidate } from './types';

// Matches public/models/labels.json (verified): 0:+ 1:- 2:× 3:÷ 4:= 5:. 6:digit
export const OPERATOR_LABELS = ['+', '-', '×', '÷', '=', '.', 'digit'];
export const DIGIT_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function softmax(logits: ArrayLike<number>): number[] {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]);
    const exps = Array.from(logits, (v) => Math.exp(v - max)); // minus max = numerical stability
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
}

async function run(session: ort.InferenceSession, ort_: typeof ort, data: Float32Array): Promise<number[]> {
    const tensor = new ort_.Tensor('float32', data, [1, 1, 28, 28]);
    const out = await session.run({ [session.inputNames[0]]: tensor });
    return softmax(out[session.outputNames[0]].data as Float32Array);
}

function top3(labels: string[], probs: number[]): PredictionCandidate[] {
    return probs
        .map((score, i) => ({ char: labels[i] ?? `?${i}`, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

/** Model O first. If it says "digit", Model D names the digit. */
export async function classifyCascade(
    ort_: typeof ort,
    opSession: ort.InferenceSession,
    digitSession: ort.InferenceSession,
    tensor: Float32Array,
): Promise<{ char: string; confidence: number; top3: PredictionCandidate[] }> {
    const opProbs = await run(opSession, ort_, tensor);
    const opTop = top3(OPERATOR_LABELS, opProbs);

    if (opTop[0].char !== 'digit') {
        return { char: opTop[0].char, confidence: opTop[0].score, top3: opTop };
    }
    const dProbs = await run(digitSession, ort_, tensor);
    const dTop = top3(DIGIT_LABELS, dProbs);
    const pDigit = opTop[0].score;
    return {
        char: dTop[0].char,
        confidence: pDigit * dTop[0].score, // both models must agree
        top3: dTop.map((c) => ({ char: c.char, score: c.score * pDigit })),
    };
}