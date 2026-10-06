/**
 * CalcInk Answer Overlay Canvas Engine
 *
 * Implements a dedicated, high-DPI aware overlay canvas positioned directly
 * over the primary drawing canvas. Configured with `pointer-events: none` to
 * ensure zero interference with 60+ FPS user drawing gestures.
 *
 * Features:
 * - Fluid fade and scale-in animation via requestAnimationFrame
 * - Guaranteed rAF cleanup on rapid updates and unmount
 * - Vibrant fountain pen blue ink styling
 * - Theme-aware palette switching for dark paper
 */

import type { EquationResult } from '../math/lineGrouping';
import { getCanvasDeviceSize } from './coords';

export interface AnswerLayerOptions {
  /** Primary ink color for evaluated mathematical answers (default: vibrant fountain ink blue) */
  successColor?: string;
  /** Ink color for division by zero ("Undefined") (default: crimson ink) */
  undefinedColor?: string;
  /** Ink color for syntax errors ("?") (default: subtle muted slate) */
  syntaxErrorColor?: string;
  isDark?: boolean;
}

export class AnswerLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  private answers: EquationResult[] = [];

  private successColor: string = '#1d4ed8';
  private undefinedColor: string = '#b91c1c';
  private syntaxErrorColor: string = 'rgba(100, 116, 139, 0.65)';
  private isDark: boolean = false;

  // Animation controller
  private animFrameId: number | null = null;
  private animStartTime: number = 0;
  private readonly animDurationMs: number = 220;
  private currentAnimProgress: number = 1;

  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, options: AnswerLayerOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context for AnswerLayer');
    }
    this.ctx = context;

    this.isDark = options.isDark ?? false;
    this.updateColors();

    if (options.successColor) this.successColor = options.successColor;
    if (options.undefinedColor) this.undefinedColor = options.undefinedColor;
    if (options.syntaxErrorColor) this.syntaxErrorColor = options.syntaxErrorColor;

    this.canvas.style.pointerEvents = 'none';

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

  /**
   * Sets up color tokens appropriate for light or dark paper themes.
   */
  private updateColors(): void {
    if (this.isDark) {
      this.successColor = '#60a5fa'; // Radiant royal blue ink for dark paper
      this.undefinedColor = '#f87171'; // Luminous crimson
      this.syntaxErrorColor = 'rgba(148, 163, 184, 0.7)'; // Lighter slate
    } else {
      this.successColor = '#1d4ed8'; // Classic vibrant fountain pen blue ink
      this.undefinedColor = '#b91c1c'; // Crimson ink
      this.syntaxErrorColor = 'rgba(100, 116, 139, 0.65)'; // Subtle slate
    }
  }

  /**
   * Toggles dark mode styling and repaints answers.
   */
  public setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.updateColors();
    this.redraw();
  }

  /**
   * Configures canvas buffer size based on devicePixelRatio and scales 2D context.
   */
  public setupDprAndSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : (this.canvas.clientWidth || 300);
    const cssHeight = rect.height > 0 ? rect.height : (this.canvas.clientHeight || 150);
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
   * Updates the list of displayed answers and triggers a smooth fade & scale-in animation.
   *
   * @param answers - Array of EquationResults produced by the math pipeline
   * @param animate - Whether to run the entrance animation (default: true)
   */
  public renderAnswers(answers: EquationResult[], animate: boolean = true): void {
    // Stop any in-progress animation frame to avoid competing render loops (Rule 7)
    this.stopAnimation();

    this.answers = [...answers];

    if (this.answers.length === 0) {
      this.clearCanvas();
      return;
    }

    if (!animate) {
      this.currentAnimProgress = 1;
      this.redraw();
      return;
    }

    // Start entrance animation
    this.animStartTime = performance.now();
    this.currentAnimProgress = 0;

    const step = (timestamp: number) => {
      const elapsed = timestamp - this.animStartTime;
      const t = Math.min(1, elapsed / this.animDurationMs);

      // Ease-out cubic curve: fast entrance with gentle deceleration
      this.currentAnimProgress = 1 - Math.pow(1 - t, 3);
      this.redraw();

      if (t < 1) {
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.animFrameId = null;
        this.currentAnimProgress = 1;
        this.redraw();
      }
    };

    this.animFrameId = requestAnimationFrame(step);
  }

  /**
   * Cancels any active requestAnimationFrame loop.
   */
  private stopAnimation(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Clears all answers, stops animations, and erases the overlay canvas.
   */
  public clear(): void {
    this.stopAnimation();
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
   * Re-draws all answers onto the overlay canvas with the current animation interpolation.
   */
  public redraw(): void {
    this.clearCanvas();

    if (this.answers.length === 0) {
      return;
    }

    const scale = 0.88 + 0.12 * this.currentAnimProgress;
    const alpha = Math.max(0, Math.min(1, this.currentAnimProgress));

    for (const item of this.answers) {
      this.drawAnswerItem(item, scale, alpha);
    }
  }

  /**
   * Renders a single evaluated answer next to the handwritten equation.
   *
   * @param item - EquationResult data containing text and coordinates
   * @param scale - Scale transform factor for entrance animation
   * @param alpha - Opacity alpha for entrance animation
   */
  private drawAnswerItem(item: EquationResult, scale: number = 1, alpha: number = 1): void {
    try {
      this.ctx.save();

      // Configure font with bold weight and clean system typography
      this.ctx.font = `600 ${item.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.ctx.textBaseline = 'alphabetic';
      this.ctx.textAlign = 'left';

      // Pick distinct ink color based on status
      let textColor: string;
      if (item.status === 'success') {
        textColor = this.successColor;
        this.ctx.shadowColor = this.isDark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(29, 78, 216, 0.22)';
        this.ctx.shadowBlur = 4;
      } else if (item.status === 'undefined') {
        textColor = this.undefinedColor;
        this.ctx.shadowColor = this.isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(185, 28, 28, 0.18)';
        this.ctx.shadowBlur = 3;
      } else {
        textColor = this.syntaxErrorColor;
        this.ctx.shadowColor = 'transparent';
      }

      this.ctx.fillStyle = textColor;
      this.ctx.globalAlpha = alpha;

      // Scale and position relative to the answer anchor
      this.ctx.translate(item.x, item.baselineY);
      if (scale !== 1) {
        this.ctx.scale(scale, scale);
      }

      this.ctx.fillText(item.displayText, 0, 0);

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
   * Cleans up event listeners, observers, and animation frames to prevent memory leaks (Rule 7).
   */
  public destroy(): void {
    this.stopAnimation();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
    }
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
