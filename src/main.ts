/**
 * CalcInk - Entry Point (Phase 4: Answer Overlay & Reactive Evaluation)
 *
 * Connects:
 * 1. DrawingCanvas (drawing input, strokes as single source of truth)
 * 2. AnswerLayer (DPR-aware non-blocking overlay for mathematical answers)
 * 3. Recognition Service (mockRecognize / neural net model)
 * 4. Line Grouping & Equation Extraction Engine
 * 5. Math Evaluation Engine (100% offline, zero-eval parser)
 * 6. Toolbar UI (Pen, Erasers, Undo/Redo, Width Slider, Clear)
 */

/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
import './style.css';
import { DrawingCanvas, type ToolType } from './canvas/DrawingCanvas';
import { AnswerLayer } from './canvas/AnswerLayer';
import { Toolbar } from './ui/Toolbar';
import { evaluate } from './math/evaluate';
import { recognize, setMockEquation, getMockEquation } from './recognition/mockRecognize';
import { processSymbols } from './math/lineGrouping';
import type { Stroke } from './types';
import { attachRecognition } from './recognition/attach';

// Expose testing helpers globally for browser console verification
(window as unknown as {
  evaluate: typeof evaluate;
  recognize: typeof recognize;
  processSymbols: typeof processSymbols;
  setMockEquation: (expr: string) => void;
  getMockEquation: () => string;
}).evaluate = evaluate;
(window as unknown as {
  recognize: typeof recognize;
}).recognize = recognize;
(window as unknown as {
  processSymbols: typeof processSymbols;
}).processSymbols = processSymbols;
(window as unknown as {
  getMockEquation: typeof getMockEquation;
}).getMockEquation = getMockEquation;
(window as unknown as {
  setMockEquation: (expr: string) => void;
}).setMockEquation = (expr: string) => {
  setMockEquation(expr);
  const strokes = drawingCanvas.getStrokes();
  if (strokes.length > 0) {
    runPipeline(strokes);
  }
  console.log(`%c[CalcInk Mock Engine]%c Set mock equation to %c"${expr}"%c. Current strokes re-evaluated!`, 'color: #2563eb; font-weight: bold', 'color: inherit', 'color: #16a34a; font-weight: bold', 'color: inherit');
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// Render layout structure
app.innerHTML = `
  <header class="calcink-header">
    <div class="brand-section">
      <h1 class="brand-title">CalcInk</h1>
      <span class="brand-badge">Phase 4</span>
      <span class="brand-subtitle">Reactive Math & Answer Overlay</span>
    </div>

    <div id="toolbar-container"></div>

    <div class="header-right">
      <div class="stats-bar">
        <div class="stat-item">Equations: <span id="eq-count">0</span></div>
        <div class="stat-item">Strokes: <span id="stroke-count">0</span></div>
        <div class="stat-item">Points: <span id="point-count">0</span></div>
        <div class="stat-item">DPR: <span id="dpr-indicator">1x</span></div>
      </div>
    </div>
  </header>

  <main class="canvas-wrapper">
    <div class="canvas-paper">
      <canvas id="drawing-canvas" class="drawing-canvas"></canvas>
      <canvas id="answer-canvas" class="answer-canvas"></canvas>
    </div>
    <footer class="canvas-footer">
      <div class="keyboard-hints">
        <span class="kbd-hint"><kbd>P</kbd> Pen</span>
        <span class="kbd-hint"><kbd>E</kbd> Stroke Eraser</span>
        <span class="kbd-hint"><kbd>X</kbd> Pixel Eraser</span>
        <span class="kbd-hint"><kbd>Ctrl+Z</kbd> Undo</span>
        <span class="kbd-hint"><kbd>Ctrl+Y</kbd> Redo</span>
        <span class="kbd-hint"><kbd>C</kbd> Clear</span>
      </div>
      <span>Reactive Equation Solver &bull; High-DPI &bull; 100% Offline &bull; Zero eval()</span>
    </footer>
  </main>
`;

// Acquire canvas elements
const drawingCanvasEl = document.querySelector<HTMLCanvasElement>('#drawing-canvas');
if (!drawingCanvasEl) {
  throw new Error('Drawing canvas element not found');
}

const answerCanvasEl = document.querySelector<HTMLCanvasElement>('#answer-canvas');
if (!answerCanvasEl) {
  throw new Error('Answer overlay canvas element not found');
}

// Acquire toolbar container
const toolbarContainer = document.querySelector<HTMLDivElement>('#toolbar-container');
if (!toolbarContainer) {
  throw new Error('Toolbar container element not found');
}

// Initialize DrawingCanvas
const drawingCanvas = new DrawingCanvas(drawingCanvasEl, {
  strokeWidth: 3,
  strokeColor: '#1e293b',
  maxHistory: 50,
});

// Initialize AnswerLayer overlay (pointer-events: none, DPR-aware)
const answerLayer = new AnswerLayer(answerCanvasEl);

// Initialize Toolbar UI
const toolbar = new Toolbar(toolbarContainer, {
  onToolChange: (tool: ToolType) => {
    drawingCanvas.setTool(tool);
  },
  onWidthChange: (width: number) => {
    drawingCanvas.setStrokeWidth(width);
  },
  onUndo: () => {
    drawingCanvas.undo();
  },
  onRedo: () => {
    drawingCanvas.redo();
  },
  onClear: () => {
    drawingCanvas.clear();
  },
});

// Sync undo/redo button enabled states with canvas history
const unsubscribeHistory = drawingCanvas.onHistoryChanged((canUndo, canRedo) => {
  toolbar.updateHistory(canUndo, canRedo);
});

attachRecognition(drawingCanvas, canvasElement);

// UI stat elements
const eqCountEl = document.querySelector<HTMLSpanElement>('#eq-count');
const strokeCountEl = document.querySelector<HTMLSpanElement>('#stroke-count');
const pointCountEl = document.querySelector<HTMLSpanElement>('#point-count');
const dprIndicatorEl = document.querySelector<HTMLSpanElement>('#dpr-indicator');

// Update DPR indicator
if (dprIndicatorEl) {
  dprIndicatorEl.textContent = `${window.devicePixelRatio || 1}x`;
}

// -----------------------------------------------------------------------------
// Reactive Evaluation Pipeline
// Debounced ~400ms after last stroke change.
// Ignores stale results using a monotonic request counter.
// -----------------------------------------------------------------------------
let recognitionRequestId = 0;
let debounceTimeoutId: number | null = null;

const runPipeline = (strokes: Stroke[]) => {
  // Cancel pending debounce timer
  if (debounceTimeoutId !== null) {
    window.clearTimeout(debounceTimeoutId);
    debounceTimeoutId = null;
  }

  // If there are no strokes (cleared or erased to zero), clear answers immediately
  if (strokes.length === 0) {
    recognitionRequestId++; // Invalidate any inflight asynchronous request
    answerLayer.clear();
    if (eqCountEl) {
      eqCountEl.textContent = '0';
    }
    return;
  }

  // Debounce ~400ms after the last stroke change
  debounceTimeoutId = window.setTimeout(async () => {
    const currentRequestId = ++recognitionRequestId;

    try {
      // Step 1: recognize strokes -> recognized symbols
      const symbols = await recognize(strokes);

      // Check if a newer stroke change arrived while recognize() was running
      if (currentRequestId !== recognitionRequestId) {
        return;
      }

      // Step 2 & 3: Line grouping, equation extraction, evaluation, coordinate positioning
      const equationResults = processSymbols(symbols);

      // Verify staleness again before rendering
      if (currentRequestId !== recognitionRequestId) {
        return;
      }

      // Step 4: Render calculated answers onto AnswerLayer
      answerLayer.renderAnswers(equationResults);

      if (eqCountEl) {
        eqCountEl.textContent = String(equationResults.length);
      }
    } catch (err) {
      // Rule 5: Never throw unhandled exceptions
      console.error('[CalcInk] Pipeline recognition error:', err);
    }
  }, 400);
};

// Subscribe to stroke changes (the stroke list is the source of truth)
const unsubscribeStrokes = drawingCanvas.onStrokesChanged((strokes: Stroke[]) => {
  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);

  if (strokeCountEl) {
    strokeCountEl.textContent = String(strokes.length);
  }
  if (pointCountEl) {
    pointCountEl.textContent = String(totalPoints);
  }

  // Trigger reactive recognition and math evaluation pipeline
  runPipeline(strokes);
});

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
  if (debounceTimeoutId !== null) {
    window.clearTimeout(debounceTimeoutId);
  }
  unsubscribeStrokes();
  unsubscribeHistory();
  toolbar.destroy();
  drawingCanvas.destroy();
  answerLayer.destroy();
});
