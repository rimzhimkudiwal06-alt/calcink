/**
 * CalcInk Toolbar UI Component
 *
 * Provides a clean, touch-friendly floating/docked toolbar with:
 * - Pen Tool (P)
 * - Stroke Eraser (E)
 * - Pixel Eraser (X)
 * - Undo (Ctrl+Z) / Redo (Ctrl+Y or Ctrl+Shift+Z)
 * - Clear Canvas (C)
 * - Stroke Width Slider (1 - 20px)
 *
 * 100% offline with zero CDN dependencies (inline SVG vector icons).
 */

import type { ToolType } from '../canvas/DrawingCanvas';

export interface ToolbarCallbacks {
  onToolChange?: (tool: ToolType) => void;
  onWidthChange?: (width: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
}

export class Toolbar {
  private container: HTMLElement;
  private callbacks: ToolbarCallbacks;

  // DOM Elements
  private btnPen!: HTMLButtonElement;
  private btnStrokeEraser!: HTMLButtonElement;
  private btnPixelEraser!: HTMLButtonElement;
  private btnUndo!: HTMLButtonElement;
  private btnRedo!: HTMLButtonElement;
  private btnClear!: HTMLButtonElement;
  private sliderWidth!: HTMLInputElement;
  private widthValueLabel!: HTMLElement;

  private boundKeydown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, callbacks: ToolbarCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.render();
    this.bindEvents();

    this.boundKeydown = this.handleKeydown.bind(this);
    window.addEventListener('keydown', this.boundKeydown);
  }

  /**
   * Renders the HTML structure of the toolbar.
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="calcink-toolbar" role="toolbar" aria-label="Drawing Tools">
        <div class="toolbar-group tool-selection">
          <button id="tool-pen" class="tool-btn active" type="button" title="Pen (P)" aria-label="Pen tool" data-tool="pen">
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
            <span class="tool-label">Pen</span>
          </button>

          <button id="tool-stroke-eraser" class="tool-btn" type="button" title="Stroke Eraser (E) - Deletes whole stroke" aria-label="Stroke eraser" data-tool="stroke-eraser">
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
              <path d="M22 21H7"></path>
              <path d="m5 11 9 9"></path>
            </svg>
            <span class="tool-label">Stroke</span>
          </button>

          <button id="tool-pixel-eraser" class="tool-btn" type="button" title="Pixel Eraser (X) - Cuts / partially erases ink" aria-label="Pixel eraser" data-tool="pixel-eraser">
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="6" width="18" height="12" rx="2" stroke-dasharray="3 3"></rect>
              <path d="m8 12 8 0"></path>
              <path d="m12 8 0 8"></path>
            </svg>
            <span class="tool-label">Pixel</span>
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group history-controls">
          <button id="btn-undo" class="tool-btn" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
          </button>

          <button id="btn-redo" class="tool-btn" type="button" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo" disabled>
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6"></path>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
            </svg>
          </button>

          <button id="btn-clear-canvas" class="tool-btn danger" type="button" title="Clear Canvas (C)" aria-label="Clear Canvas">
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group stroke-settings" title="Stroke Width">
          <label for="slider-stroke-width" class="slider-label">
            <span>Size</span>
            <span id="label-width-val" class="width-val">3</span>
          </label>
          <input
            id="slider-stroke-width"
            type="range"
            min="1"
            max="18"
            value="3"
            step="1"
            class="width-slider"
            aria-label="Stroke Width"
          />
        </div>
      </div>
    `;

    // Query elements
    this.btnPen = this.container.querySelector('#tool-pen')!;
    this.btnStrokeEraser = this.container.querySelector('#tool-stroke-eraser')!;
    this.btnPixelEraser = this.container.querySelector('#tool-pixel-eraser')!;
    this.btnUndo = this.container.querySelector('#btn-undo')!;
    this.btnRedo = this.container.querySelector('#btn-redo')!;
    this.btnClear = this.container.querySelector('#btn-clear-canvas')!;
    this.sliderWidth = this.container.querySelector('#slider-stroke-width')!;
    this.widthValueLabel = this.container.querySelector('#label-width-val')!;
  }

  private bindEvents(): void {
    const toolButtons = [this.btnPen, this.btnStrokeEraser, this.btnPixelEraser];

    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool') as ToolType;
        this.setActiveTool(tool);
        this.callbacks.onToolChange?.(tool);
      });
    });

    this.btnUndo.addEventListener('click', () => {
      this.callbacks.onUndo?.();
    });

    this.btnRedo.addEventListener('click', () => {
      this.callbacks.onRedo?.();
    });

    this.btnClear.addEventListener('click', () => {
      this.callbacks.onClear?.();
    });

    this.sliderWidth.addEventListener('input', () => {
      const width = parseInt(this.sliderWidth.value, 10) || 3;
      this.widthValueLabel.textContent = String(width);
      this.callbacks.onWidthChange?.(width);
    });
  }

  /**
   * Sets visual active tool button state.
   */
  public setActiveTool(tool: ToolType): void {
    const buttons = [this.btnPen, this.btnStrokeEraser, this.btnPixelEraser];
    buttons.forEach((btn) => {
      if (btn.getAttribute('data-tool') === tool) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Updates enabled/disabled state of Undo and Redo buttons.
   */
  public updateHistory(canUndo: boolean, canRedo: boolean): void {
    this.btnUndo.disabled = !canUndo;
    this.btnRedo.disabled = !canRedo;
  }

  /**
   * Sets stroke width slider value programmatically.
   */
  public setWidth(width: number): void {
    this.sliderWidth.value = String(width);
    this.widthValueLabel.textContent = String(width);
  }

  /**
   * Global keyboard shortcut listener for fast tool switching and undo/redo.
   */
  private handleKeydown(e: KeyboardEvent): void {
    // Ignore keystrokes if user is typing in an input or textarea
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // Undo: Ctrl+Z or Cmd+Z (without Shift)
    if (isCtrlOrMeta && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      this.callbacks.onUndo?.();
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
    if (
      isCtrlOrMeta &&
      ((e.key === 'y' || e.key === 'Y') ||
        (e.shiftKey && (e.key === 'z' || e.key === 'Z')))
    ) {
      e.preventDefault();
      this.callbacks.onRedo?.();
      return;
    }

    // Single key shortcuts (without Ctrl/Alt/Meta)
    if (!isCtrlOrMeta && !e.altKey) {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        this.setActiveTool('pen');
        this.callbacks.onToolChange?.('pen');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        this.setActiveTool('stroke-eraser');
        this.callbacks.onToolChange?.('stroke-eraser');
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        this.setActiveTool('pixel-eraser');
        this.callbacks.onToolChange?.('pixel-eraser');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        this.callbacks.onClear?.();
      }
    }
  }

  /**
   * Cleans up event listeners when unmounting toolbar.
   */
  public destroy(): void {
    window.removeEventListener('keydown', this.boundKeydown);
  }
}
