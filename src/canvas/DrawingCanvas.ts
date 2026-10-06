/**
 * CalcInk Drawing Canvas Engine
 *
 * Implements a high-performance (60+ FPS), high-DPI aware,
 * touch & stylus friendly digital ink canvas with Bezier curve smoothing,
 * pressure-sensitive ink feel (pen pressure vs. mouse fallback),
 * full undo/redo stacks, whole stroke eraser, and pixel eraser.
 */

import type { Point, Stroke } from '../types';
import { clientToCanvas, getCanvasDeviceSize } from './coords';
import { HistoryManager } from './HistoryManager';
import { isPointNearStroke, eraseFromStroke } from './geometry';
import { analyzeScratchGesture, findScratchedStrokes } from './scratchGesture';

export type ToolType = 'pen' | 'stroke-eraser' | 'pixel-eraser';

export interface DrawingCanvasOptions {
  strokeWidth?: number;
  strokeColor?: string;
  tool?: ToolType;
  maxHistory?: number;
  isDark?: boolean;
}

/**
 * Computes dynamic stroke width based on pen pressure.
 * When pressure is unavailable (e.g. mouse), falls back to constant baseWidth.
 *
 * @param baseWidth - Nominal stroke width in CSS pixels
 * @param pressure - Optional hardware pressure reading from 0.0 to 1.0
 * @returns Computed rendering width in CSS pixels
 */
export function computePointWidth(baseWidth: number, pressure?: number): number {
  if (pressure === undefined || pressure <= 0) {
    return baseWidth;
  }
  // Stylus pressure scale: ranges smoothly from 0.4x up to 1.6x of nominal width
  const scale = 0.4 + 1.2 * Math.max(0.05, Math.min(1, pressure));
  return Math.max(1, baseWidth * scale);
}

/**
 * Pure rendering function that draws a single stroke onto a Canvas 2D context
 * using quadratic Bezier curve smoothing through midpoints and rounded caps.
 * Adapts between variable-width pen pressure and high-performance constant width.
 *
 * @param ctx - The 2D rendering context (already scaled for DPR)
 * @param stroke - The stroke data to render
 * @param fallbackColor - Optional theme fallback color if stroke has no color
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  fallbackColor?: string
): void {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const strokeColor = stroke.color || fallbackColor || '#1e293b';
  const baseWidth = stroke.width || 3;

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Case 1: Single point (tap/dot)
  if (pts.length === 1) {
    const dotWidth = computePointWidth(baseWidth, pts[0].pressure);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, Math.max(1, dotWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Case 2: Exactly two points (straight segment)
  if (pts.length === 2) {
    const avgPressure =
      pts[0].pressure !== undefined && pts[1].pressure !== undefined
        ? (pts[0].pressure + pts[1].pressure) / 2
        : pts[0].pressure ?? pts[1].pressure;
    ctx.lineWidth = computePointWidth(baseWidth, avgPressure);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Check if stroke has varying pen pressure
  const hasVaryingPressure = pts.some(
    (p) => p.pressure !== undefined && p.pressure > 0 && Math.abs(p.pressure - 0.5) > 0.05
  );

  // Case 3a: Stylus with pressure sensitivity -> Multi-segment Bézier with variable width
  if (hasVaryingPressure) {
    let prevMidX = pts[0].x;
    let prevMidY = pts[0].y;

    for (let i = 1; i < pts.length - 1; i++) {
      const nextMidX = (pts[i].x + pts[i + 1].x) / 2;
      const nextMidY = (pts[i].y + pts[i + 1].y) / 2;

      ctx.lineWidth = computePointWidth(baseWidth, pts[i].pressure);
      ctx.beginPath();
      ctx.moveTo(prevMidX, prevMidY);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, nextMidX, nextMidY);
      ctx.stroke();

      prevMidX = nextMidX;
      prevMidY = nextMidY;
    }

    // Connect final segment
    const last = pts[pts.length - 1];
    ctx.lineWidth = computePointWidth(baseWidth, last.pressure);
    ctx.beginPath();
    ctx.moveTo(prevMidX, prevMidY);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    ctx.restore();
    return;
  }

  // Case 3b: Mouse or constant width -> Single contiguous path for max 60+ FPS performance
  ctx.lineWidth = baseWidth;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }

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
  private isDark: boolean = false;
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
    this.isDark = options.isDark ?? false;
    this.strokeColor = options.strokeColor ?? (this.isDark ? '#f8fafc' : '#1e293b');
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
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundWindowResize);
    }
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
    this.dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

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

    const defaultColor = this.isDark ? '#f8fafc' : '#1e293b';

    // Render every completed stroke
    for (const stroke of this.strokes) {
      // Ensure default stroke color adapts to active paper theme
      const strokeToRender =
        !stroke.color || stroke.color === '#1e293b' || stroke.color === '#f8fafc'
          ? { ...stroke, color: defaultColor }
          : stroke;
      renderStroke(this.ctx, strokeToRender, defaultColor);
    }

    // Also render active stroke if in progress
    if (this.activeStroke) {
      renderStroke(this.ctx, this.activeStroke, defaultColor);
    }
  }

  /**
   * Sets dark mode state and updates default ink color.
   */
  public setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    if (this.strokeColor === '#1e293b' && isDark) {
      this.strokeColor = '#f8fafc';
    } else if (this.strokeColor === '#f8fafc' && !isDark) {
      this.strokeColor = '#1e293b';
    }
    this.redraw();
  }

  /**
   * Returns a copy of the current strokes array.
   */
  public getStrokes(): Stroke[] {
    return [...this.strokes];
  }

  /**
   * Replaces the stroke list with a new set of strokes and triggers redraw.
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
   */
  public clear(notify: boolean = true): void {
    if (this.strokes.length === 0) return;

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

  public setTool(tool: ToolType): void {
    this.tool = tool;
    this.updateCursor();
  }

  public getTool(): ToolType {
    return this.tool;
  }

  public setStrokeWidth(width: number): void {
    this.strokeWidth = Math.max(1, width);
    this.strokeEraserRadius = Math.max(8, this.strokeWidth * 2.5);
    this.pixelEraserRadius = Math.max(8, this.strokeWidth * 3);
  }

  public getStrokeWidth(): number {
    return this.strokeWidth;
  }

  public setStrokeColor(color: string): void {
    this.strokeColor = color;
  }

  public getStrokeColor(): string {
    return this.strokeColor;
  }

  public onStrokesChanged(callback: (strokes: Stroke[]) => void): () => void {
    this.strokeChangeListeners.add(callback);
    return () => {
      this.strokeChangeListeners.delete(callback);
    };
  }

  public onHistoryChanged(
    callback: (canUndo: boolean, canRedo: boolean) => void
  ): () => void {
    this.historyChangeListeners.add(callback);
    callback(this.canUndo(), this.canRedo());
    return () => {
      this.historyChangeListeners.delete(callback);
    };
  }

  public destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundPointerCancel);

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundWindowResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.strokeChangeListeners.clear();
    this.historyChangeListeners.clear();
  }

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

  /**
   * Extracts stylus hardware pressure, falling back to undefined for mouse
   * to guarantee smooth constant width.
   */
  private extractPressure(e: PointerEvent): number | undefined {
    if (e.pointerType === 'pen' && e.pressure > 0) {
      return e.pressure;
    }
    // Mouse fallback: undefined (computes constant width)
    return undefined;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.buttons !== 1) return;
    if (this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = clientToCanvas(e.clientX, e.clientY, rect);

    this.preActionSnapshot = this.strokes.map((s) => ({
      id: s.id,
      width: s.width,
      color: s.color,
      points: s.points.map((p) => ({ ...p })),
    }));
    this.wasErasedInGesture = false;

    if (this.tool === 'pen') {
      const pressure = this.extractPressure(e);
      const point: Point = {
        x,
        y,
        t: e.timeStamp || Date.now(),
        pressure,
      };

      const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.activeStroke = {
        id: strokeId,
        points: [point],
        width: this.strokeWidth,
        color: this.strokeColor,
      };

      // Immediately render starting dot
      const dotWidth = computePointWidth(this.strokeWidth, pressure);
      this.ctx.save();
      this.ctx.fillStyle = this.strokeColor;
      this.ctx.beginPath();
      this.ctx.arc(x, y, Math.max(1, dotWidth / 2), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    } else if (this.tool === 'stroke-eraser') {
      if (this.applyStrokeEraser(x, y)) {
        this.redraw();
      }
    } else if (this.tool === 'pixel-eraser') {
      if (this.applyPixelEraser(x, y)) {
        this.redraw();
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;

    const rect = this.canvas.getBoundingClientRect();
    const events: PointerEvent[] =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];

    let eraserChanged = false;

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

        const pressure = this.extractPressure(ev);
        const point: Point = {
          x,
          y,
          t: ev.timeStamp || Date.now(),
          pressure,
        };

        points.push(point);

        // Incremental rendering for 60+ FPS responsiveness
        this.drawNewestSegment(points);
      } else if (this.tool === 'stroke-eraser') {
        if (this.applyStrokeEraser(x, y)) {
          eraserChanged = true;
        }
      } else if (this.tool === 'pixel-eraser') {
        if (this.applyPixelEraser(x, y)) {
          eraserChanged = true;
        }
      }
    }

    // Batch redraw to at most ONCE per pointermove event (Rule 3: 60 FPS)
    if (eraserChanged) {
      this.redraw();
    }
  }

  private applyStrokeEraser(x: number, y: number): boolean {
    const originalCount = this.strokes.length;
    this.strokes = this.strokes.filter(
      (stroke) => !isPointNearStroke({ x, y }, stroke, this.strokeEraserRadius)
    );

    if (this.strokes.length !== originalCount) {
      this.wasErasedInGesture = true;
      return true;
    }
    return false;
  }

  private applyPixelEraser(x: number, y: number): boolean {
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
      return true;
    }
    return false;
  }

  /**
   * Draws only the most recently added segment of the active stroke.
   */
  private drawNewestSegment(pts: Point[]): void {
    const len = pts.length;
    if (len < 2) return;

    const lastPt = pts[len - 1];
    const segmentWidth = computePointWidth(this.strokeWidth, lastPt.pressure);

    this.ctx.save();
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = segmentWidth;
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
      // Phase 6: Check for Scratch-to-Erase gesture over existing strokes
      const scratchAnalysis = analyzeScratchGesture(this.activeStroke);
      if (scratchAnalysis.isScratch) {
        const scratched = findScratchedStrokes(this.activeStroke, this.strokes);
        if (scratched.length > 0) {
          // Push pre-action state to undo stack
          if (this.preActionSnapshot) {
            this.history.push(this.preActionSnapshot);
          }
          const scratchedIds = new Set(scratched.map((s) => s.id));
          this.strokes = this.strokes.filter((s) => !scratchedIds.has(s.id));

          this.activeStroke = null;
          this.activePointerId = null;
          this.preActionSnapshot = null;
          this.wasErasedInGesture = false;

          this.redraw();
          this.notifyHistoryChanged();
          this.notifyStrokesChanged();
          return;
        }
      }

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
