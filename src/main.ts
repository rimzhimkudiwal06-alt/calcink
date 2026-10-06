/**
 * CalcInk - Entry Point (Phase 5: Paper UI & Micro-interactions)
 *
 * Connects:
 * 1. BackgroundLayer (procedural paper texture, blank/ruled/grid toggle, dark mode)
 * 2. DrawingCanvas (pressure-sensitive digital ink, 60+ FPS, strokes as single source of truth)
 * 3. AnswerLayer (DPR-aware overlay with rAF fade/scale-in entrance animation)
 * 4. SoundService (100% offline Web Audio tick & haptic feedback)
 * 5. Toolbar UI (pen, erasers, slider, history, paper mode, sound mute, dark mode)
 * 6. Reactive Evaluation Pipeline (debounced ~400ms math evaluation)
 */

import './style.css';
import { BackgroundLayer, type BackgroundPattern } from './canvas/BackgroundLayer';
import { DrawingCanvas, type ToolType } from './canvas/DrawingCanvas';
import { AnswerLayer } from './canvas/AnswerLayer';
import { SoundService } from './ui/sound';
import { Toolbar } from './ui/Toolbar';
import { evaluate } from './math/evaluate';
import { recognize, setMockEquation, getMockEquation } from './recognition/mockRecognize';
import { processSymbols } from './math/lineGrouping';
import type { Stroke } from './types';

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

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// Render layout structure
app.innerHTML = `
  <header class="calcink-header">
    <div class="brand-section">
      <h1 class="brand-title">CalcInk</h1>
      <span class="brand-badge">Phase 5</span>
      <span class="brand-subtitle">Paper UI & Micro-interactions</span>
    </div>

    <div id="toolbar-container"></div>

    <div class="header-right">
      <div class="stats-bar">
        <div class="stat-item">Eqs: <span id="eq-count">0</span></div>
        <div class="stat-item">Strokes: <span id="stroke-count">0</span></div>
        <div class="stat-item">Points: <span id="point-count">0</span></div>
        <div class="stat-item">DPR: <span id="dpr-indicator">1x</span></div>
      </div>
    </div>
  </header>

  <main class="canvas-wrapper">
    <div class="canvas-paper">
      <canvas id="background-canvas" class="background-canvas"></canvas>
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
        <span class="kbd-hint"><kbd>B</kbd> Paper Style</span>
        <span class="kbd-hint"><kbd>M</kbd> Mute</span>
        <span class="kbd-hint"><kbd>D</kbd> Dark Mode</span>
        <span class="kbd-hint"><kbd>C</kbd> Clear</span>
      </div>
      <span>Reactive Solver &bull; Stylus Pressure &bull; Web Audio Tick &bull; 100% Offline</span>
    </footer>
  </main>
`;

// Acquire canvas elements
const backgroundCanvasEl = document.querySelector<HTMLCanvasElement>('#background-canvas');
if (!backgroundCanvasEl) {
  throw new Error('Background canvas element not found');
}

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

// Restore user theme preference
let isDarkMode = false;
try {
  const savedDark = localStorage.getItem('calcink_dark_mode');
  if (savedDark !== null) {
    isDarkMode = savedDark === 'true';
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode = true;
  }
} catch {
  isDarkMode = false;
}
document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');

// Restore background pattern preference
let initialPattern: BackgroundPattern = 'ruled';
try {
  const savedPattern = localStorage.getItem('calcink_paper_pattern') as BackgroundPattern;
  if (savedPattern === 'blank' || savedPattern === 'ruled' || savedPattern === 'grid') {
    initialPattern = savedPattern;
  }
} catch {
  initialPattern = 'ruled';
}

// Initialize BackgroundLayer (dedicated background canvas, zero stroke interference)
const backgroundLayer = new BackgroundLayer(backgroundCanvasEl, {
  pattern: initialPattern,
  isDark: isDarkMode,
});

// Initialize DrawingCanvas (high-DPI, pressure-sensitive ink, undo/redo, erasers)
const drawingCanvas = new DrawingCanvas(drawingCanvasEl, {
  strokeWidth: 3,
  isDark: isDarkMode,
  maxHistory: 50,
});

// Initialize AnswerLayer overlay (pointer-events: none, rAF animated entrance)
const answerLayer = new AnswerLayer(answerCanvasEl, {
  isDark: isDarkMode,
});

// Initialize SoundService (Web Audio procedural tick & haptic feedback)
const soundService = new SoundService();

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
  onBackgroundCycle: () => {
    const nextPattern = backgroundLayer.cyclePattern();
    toolbar.setBackgroundPattern(nextPattern);
    try {
      localStorage.setItem('calcink_paper_pattern', nextPattern);
    } catch {
      // Ignore
    }
  },
  onToggleMute: () => {
    const muted = soundService.toggleMuted();
    toolbar.setMuted(muted);
  },
  onToggleDarkMode: () => {
    applyTheme(!isDarkMode);
  },
});

// Sync initial toolbar states
toolbar.setBackgroundPattern(initialPattern);
toolbar.setMuted(soundService.isMuted());
toolbar.setDarkMode(isDarkMode);

// Function to toggle day / dark paper theme
function applyTheme(dark: boolean): void {
  isDarkMode = dark;
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  backgroundLayer.setDarkMode(isDarkMode);
  drawingCanvas.setDarkMode(isDarkMode);
  answerLayer.setDarkMode(isDarkMode);
  toolbar.setDarkMode(isDarkMode);

  try {
    localStorage.setItem('calcink_dark_mode', String(isDarkMode));
  } catch {
    // Ignore
  }
}

// Sync undo/redo button enabled states with canvas history
const unsubscribeHistory = drawingCanvas.onHistoryChanged((canUndo, canRedo) => {
  toolbar.updateHistory(canUndo, canRedo);
});

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

      // Step 4: Render calculated answers onto AnswerLayer with entrance animation
      answerLayer.renderAnswers(equationResults, true);

      // Step 5: Sound & haptic micro-interaction if an equation was resolved
      if (equationResults.length > 0) {
        soundService.playAnswerTick();
      }

      if (eqCountEl) {
        eqCountEl.textContent = String(equationResults.length);
      }
    } catch (err) {
      // Rule 5: Never throw unhandled exceptions
      console.error('[CalcInk] Pipeline recognition error:', err);
    }
  }, 400);
};

// Wire up mock equation setter for browser testing
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

// Clean up listeners on page unload (Rule 7: No memory leaks)
window.addEventListener('beforeunload', () => {
  if (debounceTimeoutId !== null) {
    window.clearTimeout(debounceTimeoutId);
  }
  unsubscribeStrokes();
  unsubscribeHistory();
  toolbar.destroy();
  drawingCanvas.destroy();
  answerLayer.destroy();
  backgroundLayer.destroy();
  soundService.destroy();
});
