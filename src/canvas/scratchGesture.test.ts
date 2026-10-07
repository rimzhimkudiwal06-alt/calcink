import { describe, it, expect } from 'vitest';
import { analyzeScratchGesture, findScratchedStrokes } from './scratchGesture';
import type { Stroke } from '../types';

describe('Phase 6: Scratch-to-Erase Gesture', () => {
  it('does not classify straight or normal lines as scratch gestures', () => {
    // Straight horizontal line
    const straightLine: Stroke = {
      id: 's1',
      points: [
        { x: 10, y: 50, t: 100 },
        { x: 30, y: 50, t: 120 },
        { x: 60, y: 50, t: 140 },
        { x: 90, y: 50, t: 160 },
        { x: 120, y: 50, t: 180 },
        { x: 150, y: 50, t: 200 },
        { x: 180, y: 50, t: 220 },
        { x: 210, y: 50, t: 240 },
        { x: 240, y: 50, t: 260 },
      ],
      width: 3,
    };

    const analysis = analyzeScratchGesture(straightLine);
    expect(analysis.isScratch).toBe(false);
    expect(analysis.reversalCount).toBe(0);
  });

  it('does not classify letters like "W" (with only 3 reversals) as scratch gestures', () => {
    // "W" shaped stroke: down, up, down, up -> 3 reversals
    const wStroke: Stroke = {
      id: 'w1',
      points: [
        { x: 20, y: 20, t: 100 },
        { x: 25, y: 60, t: 120 }, // down
        { x: 30, y: 25, t: 140 }, // up
        { x: 35, y: 60, t: 160 }, // down
        { x: 40, y: 20, t: 180 }, // up
      ],
      width: 3,
    };

    const analysis = analyzeScratchGesture(wStroke);
    expect(analysis.isScratch).toBe(false);
  });

  it('correctly classifies a dense back-and-forth zig-zag scribble as a scratch gesture', () => {
    // Zig-zag scribble: 6 reversals back and forth over a word
    const scribbleStroke: Stroke = {
      id: 'scribble',
      points: [
        { x: 50, y: 50, t: 100 },
        { x: 120, y: 52, t: 120 }, // right
        { x: 45, y: 54, t: 140 }, // left (reversal 1)
        { x: 125, y: 56, t: 160 }, // right (reversal 2)
        { x: 48, y: 58, t: 180 }, // left (reversal 3)
        { x: 122, y: 60, t: 200 }, // right (reversal 4)
        { x: 42, y: 62, t: 220 }, // left (reversal 5)
        { x: 118, y: 64, t: 240 }, // right (reversal 6)
      ],
      width: 3,
    };

    const analysis = analyzeScratchGesture(scribbleStroke);
    expect(analysis.isScratch).toBe(true);
    expect(analysis.reversalCount).toBeGreaterThanOrEqual(4);
    expect(analysis.lengthRatio).toBeGreaterThan(2.0);
  });

  it('finds and matches strokes that are scribbled over', () => {
    // Existing stroke (e.g. digit "1")
    const targetStroke: Stroke = {
      id: 'target_digit',
      points: [
        { x: 80, y: 30, t: 10 },
        { x: 80, y: 50, t: 20 },
        { x: 80, y: 70, t: 30 },
      ],
      width: 3,
    };

    // Unrelated distant stroke
    const distantStroke: Stroke = {
      id: 'distant_digit',
      points: [
        { x: 300, y: 30, t: 10 },
        { x: 300, y: 70, t: 20 },
      ],
      width: 3,
    };

    // Scribble right over the target stroke (x: 50 to 120, y: ~50-60)
    const scribbleStroke: Stroke = {
      id: 'scribble_over',
      points: [
        { x: 50, y: 50, t: 100 },
        { x: 110, y: 52, t: 120 },
        { x: 50, y: 54, t: 140 },
        { x: 110, y: 56, t: 160 },
        { x: 50, y: 58, t: 180 },
        { x: 110, y: 60, t: 200 },
        { x: 50, y: 62, t: 220 },
        { x: 110, y: 64, t: 240 },
      ],
      width: 3,
    };

    const scratched = findScratchedStrokes(scribbleStroke, [targetStroke, distantStroke]);
    expect(scratched.length).toBe(1);
    expect(scratched[0].id).toBe('target_digit');
  });
});
