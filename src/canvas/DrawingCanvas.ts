/**
 * CalcInk Drawing Canvas Engine
 *
 * Implements a high-performance (60+ FPS), high-DPI aware,
 * touch & stylus friendly digital ink canvas with Bezier curve smoothing,
 * full undo/redo stacks, whole stroke eraser, and pixel eraser.
 */

import type { Point, Stroke } from '../types';
import { clientToCanvas, getCanvasDeviceSize } from './coords';
import { HistoryManager } from './HistoryManager';
import { isPointNearStroke, eraseFromStroke } from './geometry';

export type ToolType = 'pen' | 'stroke-eraser' | 'pixel-eraser';

export interface DrawingCanvasOptions {
  strokeWidth?: number;
  strokeColor?: string;
  tool?: ToolType;
  maxHistory?: number;
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
 * incremental real-time rendering, high-DPI canvas resizing,
 * and editing tools (Pen, Stroke Eraser, Pixel Eraser, Undo/Redo).
 */
export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Stroke list is the single source of truth
  private strokes: Stroke[] = [];

  // Active stroke being drawn right now
  private activeStroke: Stroke | null = null;
  private activePointerId: number | null = null;

  // Drawing and tool settings
  private tool: ToolType = 'pen';
  private strokeWidth: number;
  private strokeColor: string;
  private strokeEraserRadius: number = 10;
  private pixelEraserRadius: number = 12;

  // Undo/Redo history manager
  private history: HistoryManager;
  private preActionSnapshot: Stroke[] | null = null;
  private wasErasedInGesture: boolean = false;

  // Device pixel ratio cache
  private dpr: number = 1;

  // Listeners
  private strokeChangeListeners: Set<(strokes: Stroke[]) => void> = new Set();
  private historyChangeListeners: Set<(canUndo: boolean, canRedo: boolean) => void> = new Set();

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

    this.tool = options.tool ?? 'pen';
    this.strokeWidth = options.strokeWidth ?? 3;
    this.strokeColor = options.strokeColor ?? '#1e293b';
    this.history = new HistoryManager(options.maxHistory ?? 50);

    // Prevent default touch gestures (scrolling, zooming) over canvas
    this.canvas.style.touchAction = 'none';
    this.updateCursor();

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
   * Clears all strokes from the canvas. This operation is fully undoable!
   *
   * @param notify - Whether to fire onStrokesChanged callback (default: true)
   */
  public clear(notify: boolean = true): void {
    if (this.strokes.length === 0) return;

    // Push state to undo stack before clearing
    this.history.push(this.strokes);

    this.strokes = [];
    this.activeStroke = null;
    this.activePointerId = null;
    this.redraw();

    this.notifyHistoryChanged();
    if (notify) {
      this.notifyStrokesChanged();
    }
  }

  /**
   * Undoes the last drawing or erasing operation.
   *
   * @returns True if an undo action was performed
   */
  public undo(): boolean {
    const previous = this.history.undo(this.strokes);
    if (!previous) return false;

    this.strokes = previous;
    this.redraw();
    this.notifyHistoryChanged();
    this.notifyStrokesChanged();
    return true;
  }

  /**
   * Redoes the last undone operation.
   *
   * @returns True if a redo action was performed
   */
  public redo(): boolean {
    const next = this.history.redo(this.strokes);
    if (!next) return false;

    this.strokes = next;
    this.redraw();
    this.notifyHistoryChanged();
    this.notifyStrokesChanged();
    return true;
  }

  public canUndo(): boolean {
    return this.history.canUndo();
  }

  public canRedo(): boolean {
    return this.history.canRedo();
  }

  /**
   * Sets the active tool ('pen' | 'stroke-eraser' | 'pixel-eraser').
   */
  public setTool(tool: ToolType): void {
    this.tool = tool;
    this.updateCursor();
  }

  /**
   * Gets the currently active tool.
   */
  public getTool(): ToolType {
    return this.tool;
  }

  /**
   * Sets current stroke drawing width in CSS pixels.
   */
  public setStrokeWidth(width: number): void {
    this.strokeWidth = Math.max(1, width);
    // Also scale eraser radii proportionally for comfortable ergonomics
    this.strokeEraserRadius = Math.max(8, this.strokeWidth * 2.5);
    this.pixelEraserRadius = Math.max(8, this.strokeWidth * 3);
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
   * Subscribes to undo/redo availability updates.
   *
   * @param callback - Function receiving (canUndo, canRedo) booleans
   * @returns Unsubscribe function
   */
  public onHistoryChanged(
    callback: (canUndo: boolean, canRedo: boolean) => void
  ): () => void {
    this.historyChangeListeners.add(callback);
    // Immediately report current state upon subscription
    callback(this.canUndo(), this.canRedo());
    return () => {
      this.historyChangeListeners.delete(callback);
    };
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
    this.historyChangeListeners.clear();
  }

  // -------------------------------------------------------------
  // Tool Cursors
  // -------------------------------------------------------------

  private updateCursor(): void {
    switch (this.tool) {
      case 'pen':
        this.canvas.style.cursor = 'crosshair';
        break;
      case 'stroke-eraser':
      case 'pixel-eraser':
        this.canvas.style.cursor = 'cell';
        break;
    }
  }

  // -------------------------------------------------------------
  // Pointer Event Handlers
  // -------------------------------------------------------------

  private handlePointerDown(e: PointerEvent): void {
    // Only accept primary button (left click / touch / stylus tip)
    if (e.button !== 0 && e.buttons !== 1) return;

    // Single active pointer only
    if (this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = clientToCanvas(e.clientX, e.clientY, rect);

    // Save state snapshot for potential undo
    this.preActionSnapshot = [...this.strokes];
    this.wasErasedInGesture = false;

    if (this.tool === 'pen') {
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

      // Immediately render starting dot
      this.ctx.save();
      this.ctx.fillStyle = this.strokeColor;
      this.ctx.beginPath();
      this.ctx.arc(x, y, Math.max(1, this.strokeWidth / 2), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    } else if (this.tool === 'stroke-eraser') {
      this.applyStrokeEraser(x, y);
    } else if (this.tool === 'pixel-eraser') {
      this.applyPixelEraser(x, y);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    const rect = this.canvas.getBoundingClientRect();

    // Use getCoalescedEvents for higher frequency stylus/pen hardware sampling
    const events: PointerEvent[] =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];

    for (const ev of events) {
      const { x, y } = clientToCanvas(ev.clientX, ev.clientY, rect);

      if (this.tool === 'pen') {
        if (!this.activeStroke) continue;
        const points = this.activeStroke.points;
        const lastPoint = points[points.length - 1];

        // Avoid duplicate sub-pixel points (< 0.5px)
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

        // INCREMENTAL DRAWING: Draw only newest segment to guarantee 60+ FPS
        this.drawNewestSegment(points);
      } else if (this.tool === 'stroke-eraser') {
        this.applyStrokeEraser(x, y);
      } else if (this.tool === 'pixel-eraser') {
        this.applyPixelEraser(x, y);
      }
    }
  }

  private applyStrokeEraser(x: number, y: number): void {
    const originalCount = this.strokes.length;
    // Remove any stroke that touches the eraser circle
    this.strokes = this.strokes.filter(
      (stroke) => !isPointNearStroke({ x, y }, stroke, this.strokeEraserRadius)
    );

    if (this.strokes.length !== originalCount) {
      this.wasErasedInGesture = true;
      this.redraw();
    }
  }

  private applyPixelEraser(x: number, y: number): void {
    let changed = false;
    const nextStrokes: Stroke[] = [];

    for (const stroke of this.strokes) {
      const split = eraseFromStroke(stroke, { x, y }, this.pixelEraserRadius);
      if (split.length !== 1 || split[0] !== stroke) {
        changed = true;
      }
      nextStrokes.push(...split);
    }

    if (changed) {
      this.strokes = nextStrokes;
      this.wasErasedInGesture = true;
      this.redraw();
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
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      this.ctx.lineTo(pts[1].x, pts[1].y);
      this.ctx.stroke();
    } else if (len === 3) {
      const midX = (pts[1].x + pts[2].x) / 2;
      const midY = (pts[1].y + pts[2].y) / 2;

      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      this.ctx.quadraticCurveTo(pts[1].x, pts[1].y, midX, midY);
      this.ctx.stroke();
    } else {
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
      // Ignore
    }

    let changed = false;

    if (this.tool === 'pen' && this.activeStroke && this.activeStroke.points.length > 0) {
      if (this.preActionSnapshot) {
        this.history.push(this.preActionSnapshot);
      }
      this.strokes.push(this.activeStroke);
      changed = true;
    } else if (
      (this.tool === 'stroke-eraser' || this.tool === 'pixel-eraser') &&
      this.wasErasedInGesture &&
      this.preActionSnapshot
    ) {
      this.history.push(this.preActionSnapshot);
      changed = true;
    }

    this.activeStroke = null;
    this.activePointerId = null;
    this.preActionSnapshot = null;
    this.wasErasedInGesture = false;

    this.redraw();

    if (changed) {
      this.notifyHistoryChanged();
      this.notifyStrokesChanged();
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    // Revert to snapshot on gesture cancellation
    if (this.preActionSnapshot) {
      this.strokes = this.preActionSnapshot;
    }

    this.activeStroke = null;
    this.activePointerId = null;
    this.preActionSnapshot = null;
    this.wasErasedInGesture = false;

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

  private notifyHistoryChanged(): void {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    for (const listener of this.historyChangeListeners) {
      try {
        listener(canUndo, canRedo);
      } catch (err) {
        console.error('Error in onHistoryChanged listener:', err);
      }
    }
  }
}
