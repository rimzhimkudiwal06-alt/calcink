/**
 * CalcInk - Entry Point (Phase 1: Core Canvas)
 *
 * Initializes the DPR-aware drawing canvas, sets up pointer events,
 * and subscribes to onStrokesChanged.
 */

/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
import './style.css';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import type { Stroke } from './types';
import { attachRecognition } from './recognition/attach';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// Render initial HTML layout
app.innerHTML = `
  <header class="calcink-header">
    <div class="brand-section">
      <h1 class="brand-title">CalcInk</h1>
      <span class="brand-badge">Phase 1</span>
      <span class="brand-subtitle">Core Canvas Engine</span>
    </div>

    <div class="header-controls">
      <div class="stats-bar">
        <div class="stat-item">Strokes: <span id="stroke-count">0</span></div>
        <div class="stat-item">Points: <span id="point-count">0</span></div>
        <div class="stat-item">DPR: <span id="dpr-indicator">1x</span></div>
      </div>
      <button id="btn-clear" class="btn-secondary" type="button" title="Clear Canvas">Clear</button>
    </div>
  </header>

  <main class="canvas-wrapper">
    <div class="canvas-paper">
      <canvas id="drawing-canvas" class="drawing-canvas"></canvas>
    </div>
    <footer class="canvas-footer">
      <span>Write or sketch using mouse, stylus, or touch. Drawing is rendered at 60 FPS with midpoint Bezier smoothing.</span>
      <span>High-DPI enabled &bull; 100% Offline</span>
    </footer>
  </main>
`;

// Acquire canvas element
const canvasElement = document.querySelector<HTMLCanvasElement>('#drawing-canvas');
if (!canvasElement) {
  throw new Error('Canvas element not found');
}

// Initialize DrawingCanvas
const drawingCanvas = new DrawingCanvas(canvasElement, {
  strokeWidth: 3,
  strokeColor: '#1e293b',
});

attachRecognition(drawingCanvas, canvasElement);

// UI stat elements
const strokeCountEl = document.querySelector<HTMLSpanElement>('#stroke-count');
const pointCountEl = document.querySelector<HTMLSpanElement>('#point-count');
const dprIndicatorEl = document.querySelector<HTMLSpanElement>('#dpr-indicator');
const btnClear = document.querySelector<HTMLButtonElement>('#btn-clear');

// Update DPR display
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

  // Developer feedback in DevTools console
  console.log(`[CalcInk] onStrokesChanged: ${strokes.length} strokes (${totalPoints} points)`, strokes);
});

// Connect Clear button
btnClear?.addEventListener('click', () => {
  drawingCanvas.clear();
});

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
  unsubscribeStrokes();
  drawingCanvas.destroy();
});
