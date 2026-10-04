export interface Point {
  x: number;
  y: number;
  t: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  width: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PredictionCandidate {
  char: string;
  score: number;
}

export interface RecognizedSymbol {
  char: string;
  bbox: BoundingBox;
  confidence: number;
  strokeIds: string[];
  lineIndex?: number;
  top3?: PredictionCandidate[];
}

export type WorkerMessageType = 'init' | 'recognize' | 'result' | 'error';

export interface WorkerMessageRequest {
  type: WorkerMessageType;
  requestId: string;
  payload?: {
    strokes?: Stroke[];
    useMock?: boolean;
    wasmPath?: string;
    modelOPath?: string;
    modelDPath?: string;
  };
}

export interface WorkerMessageResponse {
  type: WorkerMessageType;
  requestId: string;
  payload?: {
    symbols?: RecognizedSymbol[];
    error?: string;
  };
}

// Global flag for fallback mock recognition
export const USE_MOCK_RECOGNIZER = { value: false };
