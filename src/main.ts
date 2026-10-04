/**
 * CalcInk - Entry Point (Phase 2: Tools & History)
 *
 * Connects DrawingCanvas with Toolbar UI, supporting:
 * - Pen, Stroke Eraser, Pixel Eraser
 * - Undo (Ctrl+Z) / Redo (Ctrl+Y / Ctrl+Shift+Z)
 * - Stroke width slider
 * - Clear canvas (undoable)
 */

import './style.css';
import { DrawingCanvas, type ToolType } from './canvas/DrawingCanvas';
import { Toolbar } from './ui/Toolbar';
import { evaluate } from './math/evaluate';
import type { Stroke } from './types';

// Expose evaluate globally for browser console testing
(window as unknown as { evaluate: typeof evaluate }).evaluate = evaluate;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// Render layout structure
app.innerHTML = `
  <header class="calcink-header">
    <div class="brand-section">
      <h1 class="brand-title">CalcInk</h1>
      <span class="brand-badge">Phase 3</span>
      <span class="brand-subtitle">Math Engine & Parser</span>
    </div>

    <div id="toolbar-container"></div>

    <div class="header-right">
      <div class="stats-bar">
        <div class="stat-item">Strokes: <span id="stroke-count">0</span></div>
        <div class="stat-item">Points: <span id="point-count">0</span></div>
        <div class="stat-item">DPR: <span id="dpr-indicator">1x</span></div>
      </div>
    </div>
  </header>

  <main class="canvas-wrapper">
    <div class="canvas-paper">
      <canvas id="drawing-canvas" class="drawing-canvas"></canvas>
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
      <span>High-DPI enabled &bull; 100% Offline &bull; Undo/Redo bounded</span>
    </footer>
  </main>
`;

// Acquire canvas element
const canvasElement = document.querySelector<HTMLCanvasElement>('#drawing-canvas');
if (!canvasElement) {
  throw new Error('Canvas element not found');
}

// Acquire toolbar container
const toolbarContainer = document.querySelector<HTMLDivElement>('#toolbar-container');
if (!toolbarContainer) {
  throw new Error('Toolbar container element not found');
}

// Initialize DrawingCanvas
const drawingCanvas = new DrawingCanvas(canvasElement, {
  strokeWidth: 3,
  strokeColor: '#1e293b',
  maxHistory: 50,
});

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

// UI stat elements
const strokeCountEl = document.querySelector<HTMLSpanElement>('#stroke-count');
const pointCountEl = document.querySelector<HTMLSpanElement>('#point-count');
const dprIndicatorEl = document.querySelector<HTMLSpanElement>('#dpr-indicator');

// Update DPR indicator
if (dprIndicatorEl) {
  dprIndicatorEl.textContent = `${window.devicePixelRatio || 1}x`;
}

// Subscribe to stroke changes (source of truth pipeline)
const unsubscribeStrokes = drawingCanvas.onStrokesChanged((strokes: Stroke[]) => {
  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);

  if (strokeCountEl) {
    strokeCountEl.textContent = String(strokes.length);
  }
  if (pointCountEl) {
    pointCountEl.textContent = String(totalPoints);
  }

  console.log(`[CalcInk] onStrokesChanged: ${strokes.length} strokes (${totalPoints} points)`);
});

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
  unsubscribeStrokes();
  unsubscribeHistory();
  toolbar.destroy();
  drawingCanvas.destroy();
});
