/**
 * CalcInk Mini Graph Plotter Overlay Component
 *
 * Provides a sleek, high-DPI interactive coordinate plane overlay that plots
 * mathematical functions of the form `y = f(x)` (e.g. "y = 2x + 1", "y = x^2 - 3", "y = sin(x)").
 *
 * 100% offline, zero-eval: Evaluates mathematical points using CalcInk's pure
 * recursive descent parser with zero external libraries or CDNs (Rule 1 & Rule 2).
 */

import { evaluate } from '../math/evaluate';
import { getCanvasDeviceSize } from '../canvas/coords';

export interface GraphOverlayOptions {
  initialFormula?: string;
  isDark?: boolean;
  onClose?: () => void;
}

export class GraphOverlay {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private formulaLabel: HTMLElement;

  private formula: string = '2x + 1';
  private isDark: boolean = false;
  private dpr: number = 1;
  private visible: boolean = false;

  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private onCloseCallback?: () => void;

  constructor(parent: HTMLElement, options: GraphOverlayOptions = {}) {
    this.formula = options.initialFormula ?? '2x + 1';
    this.isDark = options.isDark ?? false;
    this.onCloseCallback = options.onClose;

    // Create wrapper card
    this.container = document.createElement('div');
    this.container.className = 'calcink-graph-overlay hidden';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Mathematical Function Graph');

    this.container.innerHTML = `
      <div class="graph-card-header">
        <div class="graph-title-group">
          <svg class="graph-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="20" x2="21" y2="20"></line>
            <line x1="4" y1="4" x2="4" y2="20"></line>
            <polyline points="4 16 9 11 14 14 20 6"></polyline>
          </svg>
          <span class="graph-label">y = <span id="graph-formula-text">${this.formula}</span></span>
        </div>
        <button id="btn-close-graph" class="graph-close-btn" type="button" aria-label="Close Graph" title="Close Graph (G)">
          &times;
        </button>
      </div>
      <div class="graph-canvas-wrap">
        <canvas id="graph-canvas" class="graph-canvas"></canvas>
      </div>
      <div class="graph-card-footer">
        <button class="graph-preset-btn" data-preset="2x + 1">2x+1</button>
        <button class="graph-preset-btn" data-preset="x^2 - 3">x²-3</button>
        <button class="graph-preset-btn" data-preset="sin(x)">sin(x)</button>
        <button class="graph-preset-btn" data-preset="0.5x - 2">0.5x-2</button>
      </div>
    `;

    parent.appendChild(this.container);

    this.canvas = this.container.querySelector('#graph-canvas')!;
    this.formulaLabel = this.container.querySelector('#graph-formula-text')!;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context for GraphOverlay');
    }
    this.ctx = context;

    this.bindEvents();

    this.boundResize = this.handleResize.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    this.setupDprAndSize();
  }

  private bindEvents(): void {
    const closeBtn = this.container.querySelector('#btn-close-graph');
    closeBtn?.addEventListener('click', () => {
      this.hide();
      this.onCloseCallback?.();
    });

    // Preset buttons
    const presetButtons = this.container.querySelectorAll('.graph-preset-btn');
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const formula = btn.getAttribute('data-preset');
        if (formula) {
          this.setFormula(formula);
        }
      });
    });
  }

  /**
   * Configures canvas buffer size based on devicePixelRatio.
   */
  public setupDprAndSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : 260;
    const cssHeight = rect.height > 0 ? rect.height : 170;
    this.dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

    const { width, height } = getCanvasDeviceSize(cssWidth, cssHeight, this.dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.redraw();
  }

  /**
   * Plots a mathematical function formula string (e.g. "2x + 1", "x^2 - 4").
   */
  public setFormula(formula: string): void {
    let clean = formula.trim();
    if (clean.toLowerCase().startsWith('y=')) {
      clean = clean.slice(2).trim();
    } else if (clean.toLowerCase().startsWith('y =')) {
      clean = clean.slice(3).trim();
    }
    if (clean.endsWith('=')) {
      clean = clean.slice(0, -1).trim();
    }

    this.formula = clean;
    this.formulaLabel.textContent = this.formula;
    this.show();
    this.redraw();
  }

  /**
   * Returns current plotted formula.
   */
  public getFormula(): string {
    return this.formula;
  }

  public setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.redraw();
  }

  public show(): void {
    this.visible = true;
    this.container.classList.remove('hidden');
    // Ensure size is computed after making visible
    requestAnimationFrame(() => {
      this.setupDprAndSize();
    });
  }

  public hide(): void {
    this.visible = false;
    this.container.classList.add('hidden');
  }

  public toggle(): boolean {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
    return this.visible;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Renders the coordinate plane grid, axes, and function curve.
   */
  public redraw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : this.canvas.width / this.dpr;
    const h = rect.height > 0 ? rect.height : this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, w, h);

    // Coordinate space mapping:
    // Domain: x from -6 to +6
    // Range:  y from -5 to +5
    const xMin = -6;
    const xMax = 6;
    const yMin = -5;
    const yMax = 5;

    const toCanvasX = (mathX: number) => ((mathX - xMin) / (xMax - xMin)) * w;
    const toCanvasY = (mathY: number) => h - ((mathY - yMin) / (yMax - yMin)) * h;

    const originX = toCanvasX(0);
    const originY = toCanvasY(0);

    // 1. Grid Lines
    this.ctx.save();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = this.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';

    for (let x = -5; x <= 5; x += 1) {
      const cx = Math.round(toCanvasX(x)) + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, 0);
      this.ctx.lineTo(cx, h);
      this.ctx.stroke();
    }

    for (let y = -4; y <= 4; y += 1) {
      const cy = Math.round(toCanvasY(y)) + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, cy);
      this.ctx.lineTo(w, cy);
      this.ctx.stroke();
    }

    // 2. Main Axes (X & Y)
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeStyle = this.isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)';

    // X Axis
    this.ctx.beginPath();
    this.ctx.moveTo(0, originY);
    this.ctx.lineTo(w, originY);
    this.ctx.stroke();

    // Y Axis
    this.ctx.beginPath();
    this.ctx.moveTo(originX, 0);
    this.ctx.lineTo(originX, h);
    this.ctx.stroke();

    // Tick Labels
    this.ctx.font = '10px system-ui, sans-serif';
    this.ctx.fillStyle = this.isDark ? '#94a3b8' : '#64748b';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    for (const tick of [-4, -2, 2, 4]) {
      this.ctx.fillText(String(tick), toCanvasX(tick), originY + 3);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (const tick of [-4, -2, 2, 4]) {
      this.ctx.fillText(String(tick), originX - 4, toCanvasY(tick));
    }

    // 3. Plot Function Curve
    const samples = 140;
    const step = (xMax - xMin) / samples;
    let started = false;

    this.ctx.lineWidth = 2.5;
    this.ctx.strokeStyle = this.isDark ? '#60a5fa' : '#2563eb';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();

    for (let i = 0; i <= samples; i++) {
      const mathX = xMin + i * step;
      const evalRes = evaluate(this.formula, { x: mathX });

      if (evalRes.ok && isFinite(evalRes.value)) {
        const mathY = evalRes.value;
        const cx = toCanvasX(mathX);
        const cy = toCanvasY(mathY);

        // Clamp to prevent runaway path rendering
        const clampedCy = Math.max(-20, Math.min(h + 20, cy));

        if (!started) {
          this.ctx.moveTo(cx, clampedCy);
          started = true;
        } else {
          this.ctx.lineTo(cx, clampedCy);
        }
      } else {
        started = false;
      }
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.container.remove();
  }

  private handleResize(): void {
    this.setupDprAndSize();
  }
}
