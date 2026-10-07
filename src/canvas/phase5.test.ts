import { describe, it, expect, vi } from 'vitest';
import { computePointWidth } from './DrawingCanvas';
import { BackgroundLayer } from './BackgroundLayer';
import { SoundService } from '../ui/sound';

function createMockCanvas(): HTMLCanvasElement {
  const mockContext = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createPattern: vi.fn().mockReturnValue({}),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(128 * 128 * 4) }),
    putImageData: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;

  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    getContext: vi.fn().mockReturnValue(mockContext),
    getBoundingClientRect: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}

describe('Phase 5: Ink Pressure Calculations', () => {
  it('returns constant base width when pressure is undefined (mouse fallback)', () => {
    expect(computePointWidth(4, undefined)).toBe(4);
    expect(computePointWidth(10, undefined)).toBe(10);
  });

  it('returns constant base width when pressure is zero or negative', () => {
    expect(computePointWidth(5, 0)).toBe(5);
    expect(computePointWidth(5, -0.5)).toBe(5);
  });

  it('scales stroke width dynamically with pen pressure', () => {
    const baseWidth = 5;
    // Low pressure (0.1) -> scale = 0.4 + 1.2*0.1 = 0.52 -> width = 2.6
    const lowWidth = computePointWidth(baseWidth, 0.1);
    expect(lowWidth).toBeCloseTo(2.6, 1);

    // Medium pressure (0.5) -> scale = 0.4 + 1.2*0.5 = 1.0 -> width = 5.0
    const midWidth = computePointWidth(baseWidth, 0.5);
    expect(midWidth).toBeCloseTo(5.0, 1);

    // High pressure (1.0) -> scale = 0.4 + 1.2*1.0 = 1.6 -> width = 8.0
    const highWidth = computePointWidth(baseWidth, 1.0);
    expect(highWidth).toBeCloseTo(8.0, 1);
  });

  it('enforces a minimum stroke width of 1px even for near-zero pressure', () => {
    expect(computePointWidth(0.5, 0.01)).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 5: BackgroundLayer Pattern Cycling', () => {
  it('initializes with specified pattern and allows cycling', () => {
    const canvas = createMockCanvas();
    const bg = new BackgroundLayer(canvas, { pattern: 'blank' });
    expect(bg.getPattern()).toBe('blank');

    expect(bg.cyclePattern()).toBe('ruled');
    expect(bg.getPattern()).toBe('ruled');

    expect(bg.cyclePattern()).toBe('grid');
    expect(bg.getPattern()).toBe('grid');

    expect(bg.cyclePattern()).toBe('blank');
    expect(bg.getPattern()).toBe('blank');

    bg.destroy();
  });

  it('updates dark mode without throwing', () => {
    const canvas = createMockCanvas();
    const bg = new BackgroundLayer(canvas, { pattern: 'ruled', isDark: false });
    expect(() => bg.setDarkMode(true)).not.toThrow();
    expect(() => bg.setDarkMode(false)).not.toThrow();
    bg.destroy();
  });
});

describe('Phase 5: SoundService', () => {
  it('manages mute state and toggling correctly', () => {
    const sound = new SoundService();
    sound.setMuted(false);
    expect(sound.isMuted()).toBe(false);

    expect(sound.toggleMuted()).toBe(true);
    expect(sound.isMuted()).toBe(true);

    expect(sound.toggleMuted()).toBe(false);
    expect(sound.isMuted()).toBe(false);

    sound.destroy();
  });

  it('does not throw when playAnswerTick is invoked while muted or before unlock', () => {
    const sound = new SoundService();
    sound.setMuted(true);
    expect(() => sound.playAnswerTick()).not.toThrow();

    sound.setMuted(false);
    expect(() => sound.playAnswerTick()).not.toThrow();

    sound.destroy();
  });
});
