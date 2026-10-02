/**
 * CalcInk Shared Data Contract
 *
 * NOTE: This is the shared interface between:
 * - Person A (Canvas, Math Engine, UX)
 * - Person B (Handwriting Recognition, Neural Network, Web Worker)
 *
 * Keep this contract strictly compatible!
 */

/**
 * A single coordinate point sampled during drawing.
 * Coordinates (x, y) are in CSS pixels relative to the canvas origin.
 * t is the event timestamp in milliseconds.
 * pressure is an optional reading from 0.0 to 1.0 (stylus/pen).
 */
export type Point = {
  x: number;
  y: number;
  t: number;
  pressure?: number;
};

/**
 * A continuous stroke drawn by the user from pointerdown to pointerup.
 */
export type Stroke = {
  id: string;
  points: Point[];
  width: number;
  color?: string;
};

/**
 * A recognized handwritten character/symbol produced by the recognition engine.
 * bbox is in canvas CSS coordinates { x, y, w, h }.
 */
export type RecognizedSymbol = {
  char: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  confidence: number;
};

/**
 * The result of evaluating a mathematical expression.
 */
export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string };
