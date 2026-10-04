/**
 * CalcInk Answer Overlay Canvas Engine
 *
 * Implements a dedicated, high-DPI aware overlay canvas positioned directly
 * over the primary drawing canvas. Configured with `pointer-events: none` to
 * ensure zero interference with 60+ FPS user drawing gestures.
 */

import type { EquationResult } from '../math/lineGrouping';
import { getCanvasDeviceSize } from './coords';

export interface AnswerLayerOptions {
  /** Primary ink color for evaluated mathematical answers (default: vibrant ink blue) */
  successColor?: string;
  /** Ink color for division by zero ("Undefined") (default: dark crimson) */
  undefinedColor?: string;
  /** Ink color for syntax errors ("?") (default: subtle muted slate) */
  syntaxErrorColor?: string;
}

/**
 * AnswerLayer manages rendering calculated mathematical results directly onto
 * the canvas next to handwritten terminal '=' signs.
 */
export class AnswerLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  private answers: EquationResult[] = [];

  private successColor: string;
  private undefinedColor: string;
  private syntaxErrorColor: string;

  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Initializes the AnswerLayer on top of the given HTMLCanvasElement.
   *
   * @param canvas - The overlay canvas element
   * @param options - Visual styling configuration
   */
  constructor(canvas: HTMLCanvasElement, options: AnswerLayerOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context for AnswerLayer');
    }
    this.ctx = context;

    this.successColor = options.successColor ?? '#1d4ed8'; // Vibrant ink blue
    this.undefinedColor = options.undefinedColor ?? '#b91c1c'; // Crimson ink
    this.syntaxErrorColor = options.syntaxErrorColor ?? 'rgba(100, 116, 139, 0.65)'; // Subtle slate

    // Ensure pointer events pass directly through to the drawing canvas below
    this.canvas.style.pointerEvents = 'none';

    // Handle high-DPI scaling and window resizing
    this.boundResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    this.setupDprAndSize();
  }

  /**
   * Configures canvas buffer size based on devicePixelRatio and scales 2D context.
   */
  public setupDprAndSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : (this.canvas.clientWidth || 300);
    const cssHeight = rect.height > 0 ? rect.height : (this.canvas.clientHeight || 150);
    this.dpr = window.devicePixelRatio || 1;

    const { width, height } = getCanvasDeviceSize(cssWidth, cssHeight, this.dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // High-DPI transformation matrix
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Re-render answers after resize
    this.redraw();
  }

  /**
   * Updates the list of displayed answers and triggers a canvas redraw.
   *
   * @param answers - Array of EquationResults produced by the math pipeline
   */
  public renderAnswers(answers: EquationResult[]): void {
    this.answers = [...answers];
    this.redraw();
  }

  /**
   * Clears all answers and erases the overlay canvas.
   */
  public clear(): void {
    this.answers = [];
    this.clearCanvas();
  }

  /**
   * Clears the pixel buffer without clearing the stored answer models.
   */
  private clearCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : this.canvas.width / this.dpr;
    const cssHeight = rect.height > 0 ? rect.height : this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, cssWidth, cssHeight);
  }

  /**
   * Re-draws all answers onto the overlay canvas.
   */
  public redraw(): void {
    this.clearCanvas();

    if (this.answers.length === 0) {
      return;
    }

    for (const item of this.answers) {
      this.drawAnswerItem(item);
    }
  }

  /**
   * Renders a single evaluated answer next to the handwritten equation.
   *
   * @param item - EquationResult data containing text and coordinates
   */
  private drawAnswerItem(item: EquationResult): void {
    try {
      this.ctx.save();

      // Configure font with bold weight and clean system typography
      this.ctx.font = `600 ${item.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.ctx.textBaseline = 'alphabetic';
      this.ctx.textAlign = 'left';

      // Pick distinct color based on status
      let textColor: string;
      if (item.status === 'success') {
        textColor = this.successColor;
        // Subtle digital ink glow
        this.ctx.shadowColor = 'rgba(29, 78, 216, 0.18)';
        this.ctx.shadowBlur = 3;
      } else if (item.status === 'undefined') {
        textColor = this.undefinedColor;
        this.ctx.shadowColor = 'rgba(185, 28, 28, 0.15)';
        this.ctx.shadowBlur = 2;
      } else {
        textColor = this.syntaxErrorColor;
        this.ctx.shadowColor = 'transparent';
      }

      this.ctx.fillStyle = textColor;
      this.ctx.fillText(item.displayText, item.x, item.baselineY);

      this.ctx.restore();
    } catch (err) {
      console.error('[CalcInk] Failed to draw answer item:', err);
    }
  }

  /**
   * Gets the currently rendered answers.
   */
  public getAnswers(): EquationResult[] {
    return [...this.answers];
  }

  /**
   * Cleans up event listeners and observers to prevent memory leaks.
   */
  public destroy(): void {
    window.removeEventListener('resize', this.boundResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.answers = [];
  }

  private handleResize(): void {
    this.setupDprAndSize();
  }
}
