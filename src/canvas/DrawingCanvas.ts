/**
 * CalcInk Drawing Canvas Engine
 *
 * Implements a high-performance (60+ FPS), high-DPI aware,
 * touch & stylus friendly digital ink canvas with Bezier curve smoothing.
 */

import type { Point, Stroke } from '../types';
import { clientToCanvas, getCanvasDeviceSize } from './coords';

export interface DrawingCanvasOptions {
  strokeWidth?: number;
  strokeColor?: string;
}

/**
 * Pure rendering function that draws a single stroke onto a Canvas 2D context
 * using quadratic Bezier curve smoothing through midpoints.
 *
 * @param ctx - The 2D rendering context (already scaled for DPR)
 * @param stroke - The stroke data to render
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke
): void {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  ctx.save();
  ctx.strokeStyle = stroke.color || '#1e293b';
  ctx.fillStyle = stroke.color || '#1e293b';
  ctx.lineWidth = stroke.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Case 1: Single point (tap/dot)
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Case 2: Exactly two points (straight segment)
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Case 3: 3+ points -> Smooth curve using quadratic Bezier through midpoints
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }

  // Finish connecting the last midpoint to the final point
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  ctx.restore();
}

/**
 * DrawingCanvas manages user pointer input, stroke state,
 * incremental real-time rendering, and high-DPI canvas resizing.
 */
export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Stroke list is the single source of truth
  private strokes: Stroke[] = [];

  // Active stroke being drawn right now
  private activeStroke: Stroke | null = null;
  private activePointerId: number | null = null;

  // Drawing settings
  private strokeWidth: number;
  private strokeColor: string;

  // Device pixel ratio cache
  private dpr: number = 1;

  // Listeners for stroke mutations
  private strokeChangeListeners: Set<(strokes: Stroke[]) => void> = new Set();

  // Bound event handlers for clean removal
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;
  private boundWindowResize: () => void;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Initializes the DrawingCanvas on the provided HTMLCanvasElement.
   */
  constructor(canvas: HTMLCanvasElement, options: DrawingCanvasOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context for canvas');
    }
    this.ctx = context;

    this.strokeWidth = options.strokeWidth ?? 3;
    this.strokeColor = options.strokeColor ?? '#1e293b';

    // Prevent default touch gestures (scrolling, zooming) over canvas
    this.canvas.style.touchAction = 'none';

    // Bind event handlers
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundWindowResize = this.handleResize.bind(this);

    // Attach pointer listeners
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    this.canvas.addEventListener('pointermove', this.boundPointerMove);
    this.canvas.addEventListener('pointerup', this.boundPointerUp);
    this.canvas.addEventListener('pointercancel', this.boundPointerCancel);

    // Watch for canvas resizing to maintain sharp high-DPI resolution
    window.addEventListener('resize', this.boundWindowResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    // Initial sizing and setup
    this.setupDprAndSize();
  }

  /**
   * Configures canvas buffer size based on window.devicePixelRatio
   * and scales the 2D context so CSS coordinates map directly 1:1.
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

    // Set high-DPI transformation matrix
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Repaint all strokes without losing existing drawing
    this.redraw();
  }

  /**
   * Re-renders all strokes from scratch.
   * Called on resize, undo/redo, stroke erase, and at stroke completion.
   */
  public redraw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : this.canvas.width / this.dpr;
    const cssHeight = rect.height > 0 ? rect.height : this.canvas.height / this.dpr;

    // Clear whole drawing area
    this.ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Render every completed stroke
    for (const stroke of this.strokes) {
      renderStroke(this.ctx, stroke);
    }

    // Also render active stroke if in progress
    if (this.activeStroke) {
      renderStroke(this.ctx, this.activeStroke);
    }
  }

  /**
   * Returns a copy of the current strokes array.
   */
  public getStrokes(): Stroke[] {
    return [...this.strokes];
  }

  /**
   * Replaces the stroke list with a new set of strokes and triggers redraw.
   *
   * @param strokes - New list of strokes
   * @param notify - Whether to fire onStrokesChanged callback (default: true)
   */
  public setStrokes(strokes: Stroke[], notify: boolean = true): void {
    this.strokes = [...strokes];
    this.redraw();
    if (notify) {
      this.notifyStrokesChanged();
    }
  }

  /**
   * Clears all strokes from the canvas.
   *
   * @param notify - Whether to fire onStrokesChanged callback (default: true)
   */
  public clear(notify: boolean = true): void {
    this.strokes = [];
    this.activeStroke = null;
    this.activePointerId = null;
    this.redraw();
    if (notify) {
      this.notifyStrokesChanged();
    }
  }

  /**
   * Subscribes to stroke changes.
   *
   * @param callback - Function invoked whenever strokes are added, updated, or cleared
   * @returns Unsubscribe function to clean up listener
   */
  public onStrokesChanged(callback: (strokes: Stroke[]) => void): () => void {
    this.strokeChangeListeners.add(callback);
    return () => {
      this.strokeChangeListeners.delete(callback);
    };
  }

  /**
   * Sets current stroke drawing width in CSS pixels.
   */
  public setStrokeWidth(width: number): void {
    this.strokeWidth = Math.max(1, width);
  }

  /**
   * Gets current stroke drawing width.
   */
  public getStrokeWidth(): number {
    return this.strokeWidth;
  }

  /**
   * Sets current stroke drawing color.
   */
  public setStrokeColor(color: string): void {
    this.strokeColor = color;
  }

  /**
   * Gets current stroke drawing color.
   */
  public getStrokeColor(): string {
    return this.strokeColor;
  }

  /**
   * Cleans up all event listeners and observers to prevent memory leaks.
   */
  public destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundPointerCancel);

    window.removeEventListener('resize', this.boundWindowResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.strokeChangeListeners.clear();
  }

  // -------------------------------------------------------------
  // Pointer Event Handlers
  // -------------------------------------------------------------

  private handlePointerDown(e: PointerEvent): void {
    // Only accept primary button (left mouse click, pen contact, or first finger touch)
    if (e.button !== 0 && e.buttons !== 1) return;

    // Single active pointer only: ignore multi-touch secondary fingers
    if (this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if setPointerCapture fails on certain browsers
    }

    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = clientToCanvas(e.clientX, e.clientY, rect);

    const point: Point = {
      x,
      y,
      t: e.timeStamp || Date.now(),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };

    const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.activeStroke = {
      id: strokeId,
      points: [point],
      width: this.strokeWidth,
      color: this.strokeColor,
    };

    // Immediately render a small initial dot for responsiveness
    this.ctx.save();
    this.ctx.fillStyle = this.strokeColor;
    this.ctx.beginPath();
    this.ctx.arc(x, y, Math.max(1, this.strokeWidth / 2), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId || !this.activeStroke) return;

    const rect = this.canvas.getBoundingClientRect();

    // Use getCoalescedEvents for higher frequency stylus/pen hardware sampling
    const events: PointerEvent[] =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];

    for (const ev of events) {
      const { x, y } = clientToCanvas(ev.clientX, ev.clientY, rect);
      const points = this.activeStroke.points;
      const lastPoint = points[points.length - 1];

      // Avoid duplicate points if movement is sub-pixel (< 0.5px)
      if (lastPoint) {
        const dx = x - lastPoint.x;
        const dy = y - lastPoint.y;
        if (dx * dx + dy * dy < 0.25) {
          continue;
        }
      }

      const point: Point = {
        x,
        y,
        t: ev.timeStamp || Date.now(),
        pressure: ev.pressure > 0 ? ev.pressure : 0.5,
      };

      points.push(point);

      // INCREMENTAL DRAWING: Draw ONLY the newest curve segment!
      // This avoids redrawing every stroke on every pointermove, guaranteeing 60+ FPS.
      this.drawNewestSegment(points);
    }
  }

  /**
   * Draws only the most recently added segment of the active stroke.
   */
  private drawNewestSegment(pts: Point[]): void {
    const len = pts.length;
    if (len < 2) return;

    this.ctx.save();
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (len === 2) {
      // First line segment
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      this.ctx.lineTo(pts[1].x, pts[1].y);
      this.ctx.stroke();
    } else if (len === 3) {
      // Transition from start to first midpoint
      const midX = (pts[1].x + pts[2].x) / 2;
      const midY = (pts[1].y + pts[2].y) / 2;

      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      this.ctx.quadraticCurveTo(pts[1].x, pts[1].y, midX, midY);
      this.ctx.stroke();
    } else {
      // Subsequent segments: from previous midpoint to new midpoint
      const prevMidX = (pts[len - 3].x + pts[len - 2].x) / 2;
      const prevMidY = (pts[len - 3].y + pts[len - 2].y) / 2;

      const newMidX = (pts[len - 2].x + pts[len - 1].x) / 2;
      const newMidY = (pts[len - 2].y + pts[len - 1].y) / 2;

      this.ctx.beginPath();
      this.ctx.moveTo(prevMidX, prevMidY);
      this.ctx.quadraticCurveTo(pts[len - 2].x, pts[len - 2].y, newMidX, newMidY);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture release throws
    }

    if (this.activeStroke && this.activeStroke.points.length > 0) {
      this.strokes.push(this.activeStroke);
    }

    this.activeStroke = null;
    this.activePointerId = null;

    // Full redraw once at stroke completion to ensure flawless anti-aliasing
    this.redraw();

    // Notify all subscribers of the updated stroke collection
    this.notifyStrokesChanged();
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    this.activeStroke = null;
    this.activePointerId = null;
    this.redraw();
  }

  private handleResize(): void {
    this.setupDprAndSize();
  }

  private notifyStrokesChanged(): void {
    const currentStrokes = this.getStrokes();
    for (const listener of this.strokeChangeListeners) {
      try {
        listener(currentStrokes);
      } catch (err) {
        console.error('Error in onStrokesChanged listener:', err);
      }
    }
  }
}
