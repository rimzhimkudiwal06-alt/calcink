/**
 * CalcInk Procedural Background Layer
 *
 * Implements a high-DPI aware background canvas positioned behind all drawing
 * surfaces (`z-index: 0`, `pointer-events: none`).
 *
 * Features:
 * 1. Warm paper color with procedural micro-texture generated ONCE in code (zero external images/CDNs).
 * 2. Toggleable patterns: 'blank', 'ruled' (notebook lines + margin), and 'grid' (dot grid).
 * 3. Seamless dark mode palette adaptation.
 * 4. Zero drawing performance impact (repaints only on mode/theme/resize changes).
 */

import { getCanvasDeviceSize } from './coords';

export type BackgroundPattern = 'blank' | 'ruled' | 'grid';

export interface BackgroundLayerOptions {
  pattern?: BackgroundPattern;
  isDark?: boolean;
}

export class BackgroundLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  private pattern: BackgroundPattern = 'ruled';
  private isDark: boolean = false;

  // Cached pattern surfaces generated once to prevent per-frame overhead
  private cachedLightTexturePattern: CanvasPattern | null = null;
  private cachedDarkTexturePattern: CanvasPattern | null = null;

  private boundResize: () => void;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, options: BackgroundLayerOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context for BackgroundLayer');
    }
    this.ctx = context;

    this.pattern = options.pattern ?? 'ruled';
    this.isDark = options.isDark ?? false;

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
   * Pre-generates a subtle procedural paper fiber pattern using an offscreen canvas.
   * Executed once per theme to maintain strict 60 FPS drawing performance.
   */
  private getOrCreateTexturePattern(isDark: boolean): CanvasPattern | null {
    if (typeof document === 'undefined') {
      return null;
    }

    if (isDark && this.cachedDarkTexturePattern) {
      return this.cachedDarkTexturePattern;
    }
    if (!isDark && this.cachedLightTexturePattern) {
      return this.cachedLightTexturePattern;
    }

    const offscreen = document.createElement('canvas');
    const size = 128;
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return null;

    const imgData = offCtx.createImageData(size, size);
    const data = imgData.data;

    // Deterministic pseudo-random noise for subtle paper tooth / fibers
    let seed = 42;
    const pseudoRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const count = size * size * 4;
    for (let i = 0; i < count; i += 4) {
      const noise = pseudoRandom();
      if (isDark) {
        // Subtle dark grain
        const val = noise > 0.5 ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = Math.floor(noise * 7); // Very subtle alpha <= 7/255
      } else {
        // Subtle warm paper grain
        data[i] = 120;
        data[i + 1] = 95;
        data[i + 2] = 60;
        data[i + 3] = Math.floor(noise * 9); // Very subtle alpha <= 9/255
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    const pattern = this.ctx.createPattern(offscreen, 'repeat');

    if (isDark) {
      this.cachedDarkTexturePattern = pattern;
    } else {
      this.cachedLightTexturePattern = pattern;
    }

    return pattern;
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
   * Updates the background pattern ('blank' | 'ruled' | 'grid').
   */
  public setPattern(pattern: BackgroundPattern): void {
    if (this.pattern === pattern) return;
    this.pattern = pattern;
    this.redraw();
  }

  /**
   * Gets current background pattern.
   */
  public getPattern(): BackgroundPattern {
    return this.pattern;
  }

  /**
   * Cycles to the next background pattern: blank -> ruled -> grid -> blank.
   */
  public cyclePattern(): BackgroundPattern {
    const next: Record<BackgroundPattern, BackgroundPattern> = {
      blank: 'ruled',
      ruled: 'grid',
      grid: 'blank',
    };
    const newPattern = next[this.pattern];
    this.setPattern(newPattern);
    return newPattern;
  }

  /**
   * Updates dark mode appearance.
   */
  public setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark) return;
    this.isDark = isDark;
    this.redraw();
  }

  /**
   * Repaints the background canvas.
   */
  public redraw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : this.canvas.width / this.dpr;
    const h = rect.height > 0 ? rect.height : this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Base Paper Color Fill
    this.ctx.fillStyle = this.isDark ? '#191b20' : '#fdfbf7';
    this.ctx.fillRect(0, 0, w, h);

    // 2. Procedural Subtle Paper Texture Grain
    const texture = this.getOrCreateTexturePattern(this.isDark);
    if (texture) {
      this.ctx.save();
      this.ctx.fillStyle = texture;
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();
    }

    // 3. Draw Selected Background Pattern
    if (this.pattern === 'ruled') {
      this.drawRuledLines(w, h);
    } else if (this.pattern === 'grid') {
      this.drawDotGrid(w, h);
    }
  }

  /**
   * Draws crisp horizontal notebook ruled lines and vertical margin line.
   */
  private drawRuledLines(w: number, h: number): void {
    this.ctx.save();
    const lineSpacing = 32;
    const startY = 40;

    // Faint horizontal ruled notebook lines
    this.ctx.strokeStyle = this.isDark
      ? 'rgba(255, 255, 255, 0.07)'
      : 'rgba(160, 140, 110, 0.22)';
    this.ctx.lineWidth = 1;

    this.ctx.beginPath();
    for (let y = startY + 0.5; y < h; y += lineSpacing) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
    }
    this.ctx.stroke();

    // Notebook left vertical margin line
    const marginX = 52.5;
    if (w > 120) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.isDark
        ? 'rgba(239, 68, 68, 0.18)'
        : 'rgba(220, 70, 70, 0.22)';
      this.ctx.moveTo(marginX, 0);
      this.ctx.lineTo(marginX, h);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draws a faint, clean dot grid.
   */
  private drawDotGrid(w: number, h: number): void {
    this.ctx.save();
    const dotSpacing = 26;
    const dotRadius = 1;

    this.ctx.fillStyle = this.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(140, 120, 90, 0.3)';

    for (let x = dotSpacing; x < w; x += dotSpacing) {
      for (let y = dotSpacing; y < h; y += dotSpacing) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

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
  }

  private handleResize(): void {
    this.setupDprAndSize();
  }
}
