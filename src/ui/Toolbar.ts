/**
 * CalcInk Toolbar UI Component
 *
 * Provides a clean, touch-friendly floating/docked toolbar with:
 * - Pen Tool (P)
 * - Stroke Eraser (E)
 * - Pixel Eraser (X)
 * - Undo (Ctrl+Z) / Redo (Ctrl+Y or Ctrl+Shift+Z)
 * - Clear Canvas (C)
 * - Stroke Width Slider (1 - 18px)
 * - Background Style Toggle (B) [Blank / Ruled / Grid]
 * - Audio Mute Toggle (M) [Web Audio tick & vibration]
 * - Dark Mode Toggle (D) [Day / Night Paper]
 *
 * 100% offline with zero CDN dependencies (inline SVG vector icons).
 * Keyboard accessible with full ARIA semantics and high-contrast focus rings.
 */

import type { ToolType } from '../canvas/DrawingCanvas';
import type { BackgroundPattern } from '../canvas/BackgroundLayer';

export interface ToolbarCallbacks {
  onToolChange?: (tool: ToolType) => void;
  onWidthChange?: (width: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  onBackgroundCycle?: () => void;
  onToggleMute?: () => void;
  onToggleDarkMode?: () => void;
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

  // Phase 5 Elements
  private btnBgToggle!: HTMLButtonElement;
  private bgIconContainer!: HTMLElement;
  private btnMuteToggle!: HTMLButtonElement;
  private muteIconContainer!: HTMLElement;
  private btnThemeToggle!: HTMLButtonElement;
  private themeIconContainer!: HTMLElement;

  private currentPattern: BackgroundPattern = 'ruled';
  private isMuted: boolean = false;
  private isDark: boolean = false;

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
   * Renders the accessible HTML structure of the toolbar.
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="calcink-toolbar" role="toolbar" aria-label="Drawing and Canvas Tools">
        <!-- Tool Selection Group -->
        <div class="toolbar-group tool-selection" role="group" aria-label="Drawing Tools">
          <button id="tool-pen" class="tool-btn active" type="button" title="Pen (P) - Stylus pressure enabled" aria-label="Pen tool" data-tool="pen">
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

        <div class="toolbar-divider" aria-hidden="true"></div>

        <!-- History Controls -->
        <div class="toolbar-group history-controls" role="group" aria-label="History Tools">
          <button id="btn-undo" class="tool-btn" type="button" title="Undo (Ctrl+Z)" aria-label="Undo last action" disabled>
            <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
          </button>

          <button id="btn-redo" class="tool-btn" type="button" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo action" disabled>
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

        <div class="toolbar-divider" aria-hidden="true"></div>

        <!-- Stroke Width Slider -->
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
            aria-label="Stroke Width Slider"
          />
        </div>

        <div class="toolbar-divider" aria-hidden="true"></div>

        <!-- Micro-interactions & Theme Toggles (Phase 5) -->
        <div class="toolbar-group micro-toggles" role="group" aria-label="Paper & Sound Settings">
          <!-- Background Paper Pattern Toggle -->
          <button id="btn-bg-toggle" class="tool-btn" type="button" title="Paper Background: Ruled Lines (B to cycle)" aria-label="Toggle paper background style">
            <span id="bg-icon-container" class="toggle-icon-wrap"></span>
            <span class="tool-label" id="bg-label">Ruled</span>
          </button>

          <!-- Audio Tick & Vibration Mute Toggle -->
          <button id="btn-mute-toggle" class="tool-btn" type="button" title="Sound: On (M to toggle)" aria-label="Toggle answer sound" aria-pressed="false">
            <span id="mute-icon-container" class="toggle-icon-wrap"></span>
          </button>

          <!-- Day/Night Dark Paper Theme Toggle -->
          <button id="btn-theme-toggle" class="tool-btn" type="button" title="Dark Mode (D to toggle)" aria-label="Toggle dark mode theme" aria-pressed="false">
            <span id="theme-icon-container" class="toggle-icon-wrap"></span>
          </button>
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

    this.btnBgToggle = this.container.querySelector('#btn-bg-toggle')!;
    this.bgIconContainer = this.container.querySelector('#bg-icon-container')!;
    this.btnMuteToggle = this.container.querySelector('#btn-mute-toggle')!;
    this.muteIconContainer = this.container.querySelector('#mute-icon-container')!;
    this.btnThemeToggle = this.container.querySelector('#btn-theme-toggle')!;
    this.themeIconContainer = this.container.querySelector('#theme-icon-container')!;

    this.renderBgIcon();
    this.renderMuteIcon();
    this.renderThemeIcon();
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

    this.btnBgToggle.addEventListener('click', () => {
      this.callbacks.onBackgroundCycle?.();
    });

    this.btnMuteToggle.addEventListener('click', () => {
      this.callbacks.onToggleMute?.();
    });

    this.btnThemeToggle.addEventListener('click', () => {
      this.callbacks.onToggleDarkMode?.();
    });
  }

  // ---------------------------------------------------------------------------
  // Phase 5 Icon Rendering & State Updates
  // ---------------------------------------------------------------------------

  public setBackgroundPattern(pattern: BackgroundPattern): void {
    this.currentPattern = pattern;
    const labelEl = this.container.querySelector('#bg-label');
    if (labelEl) {
      labelEl.textContent = pattern.charAt(0).toUpperCase() + pattern.slice(1);
    }
    this.btnBgToggle.title = `Paper Background: ${pattern} (Press B to cycle)`;
    this.renderBgIcon();
  }

  private renderBgIcon(): void {
    let svg = '';
    if (this.currentPattern === 'blank') {
      svg = `<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>`;
    } else if (this.currentPattern === 'ruled') {
      svg = `<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`;
    } else {
      // Dot Grid
      svg = `<svg class="tool-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="1.5"></circle><circle cx="12" cy="7" r="1.5"></circle><circle cx="17" cy="7" r="1.5"></circle><circle cx="7" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="17" cy="12" r="1.5"></circle><circle cx="7" cy="17" r="1.5"></circle><circle cx="12" cy="17" r="1.5"></circle><circle cx="17" cy="17" r="1.5"></circle></svg>`;
    }
    this.bgIconContainer.innerHTML = svg;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.btnMuteToggle.setAttribute('aria-pressed', String(muted));
    this.btnMuteToggle.title = muted ? 'Sound: Muted (M to unmute)' : 'Sound: On (M to mute)';
    this.renderMuteIcon();
  }

  private renderMuteIcon(): void {
    if (this.isMuted) {
      this.muteIconContainer.innerHTML = `
        <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      `;
    } else {
      this.muteIconContainer.innerHTML = `
        <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        </svg>
      `;
    }
  }

  public setDarkMode(isDark: boolean): void {
    this.isDark = isDark;
    this.btnThemeToggle.setAttribute('aria-pressed', String(isDark));
    this.btnThemeToggle.title = isDark ? 'Light Paper (D to toggle)' : 'Dark Paper (D to toggle)';
    this.renderThemeIcon();
  }

  private renderThemeIcon(): void {
    if (this.isDark) {
      // Sun icon to switch to light mode
      this.themeIconContainer.innerHTML = `
        <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      `;
    } else {
      // Moon icon to switch to dark mode
      this.themeIconContainer.innerHTML = `
        <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
    }
  }

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

  public updateHistory(canUndo: boolean, canRedo: boolean): void {
    this.btnUndo.disabled = !canUndo;
    this.btnRedo.disabled = !canRedo;
  }

  public setWidth(width: number): void {
    this.sliderWidth.value = String(width);
    this.widthValueLabel.textContent = String(width);
  }

  /**
   * Global keyboard shortcut listener for fast tool switching, undo/redo,
   * background cycle, mute toggle, and dark mode toggle.
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // Undo: Ctrl+Z
    if (isCtrlOrMeta && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      this.callbacks.onUndo?.();
      return;
    }

    // Redo: Ctrl+Y / Ctrl+Shift+Z
    if (
      isCtrlOrMeta &&
      ((e.key === 'y' || e.key === 'Y') ||
        (e.shiftKey && (e.key === 'z' || e.key === 'Z')))
    ) {
      e.preventDefault();
      this.callbacks.onRedo?.();
      return;
    }

    // Single key shortcuts
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
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        this.callbacks.onBackgroundCycle?.();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.callbacks.onToggleMute?.();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.callbacks.onToggleDarkMode?.();
      }
    }
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.boundKeydown);
  }
}
