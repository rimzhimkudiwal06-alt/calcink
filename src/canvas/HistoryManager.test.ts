import { describe, it, expect } from 'vitest';
import { HistoryManager } from './HistoryManager';
import type { Stroke } from '../types';

function createDummyStroke(id: string): Stroke {
  return {
    id,
    points: [{ x: 10, y: 10, t: 100 }],
    width: 2,
    color: '#000000',
  };
}

describe('HistoryManager (Undo/Redo)', () => {
  it('initializes with empty undo and redo stacks', () => {
    const history = new HistoryManager(10);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoCount()).toBe(0);
    expect(history.getRedoCount()).toBe(0);
  });

  it('pushes previous state and enables undo', () => {
    const history = new HistoryManager(10);
    history.push([]);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoCount()).toBe(1);
  });

  it('undoes and redoes correctly across multiple states', () => {
    const history = new HistoryManager(10);

    const state0: Stroke[] = [];
    const state1: Stroke[] = [createDummyStroke('s1')];
    const state2: Stroke[] = [createDummyStroke('s1'), createDummyStroke('s2')];

    // Transition 0 -> 1
    history.push(state0);
    // Transition 1 -> 2
    history.push(state1);

    // Current state is state2. Undo should restore state1
    const undone1 = history.undo(state2);
    expect(undone1).toEqual(state1);
    expect(history.canRedo()).toBe(true);

    // Undo again should restore state0
    const undone2 = history.undo(state1);
    expect(undone2).toEqual(state0);
    expect(history.canUndo()).toBe(false);

    // Redo should restore state1
    const redone1 = history.redo(state0);
    expect(redone1).toEqual(state1);
    expect(history.canUndo()).toBe(true);

    // Redo again should restore state2
    const redone2 = history.redo(state1);
    expect(redone2).toEqual(state2);
    expect(history.canRedo()).toBe(false);
  });

  it('clears redo stack when a new action is performed after undo', () => {
    const history = new HistoryManager(10);

    const s1 = [createDummyStroke('1')];
    const s2 = [createDummyStroke('1'), createDummyStroke('2')];
    const s3_alternate = [createDummyStroke('1'), createDummyStroke('3')];

    history.push([]); // state before s1
    history.push(s1); // state before s2

    // Undo back to s1
    history.undo(s2);
    expect(history.canRedo()).toBe(true);

    // User draws something new (s3_alternate)
    history.push(s3_alternate);
    expect(history.canRedo()).toBe(false); // Redo history pruned
  });

  it('caps history stack to maxHistory limit (preventing memory leaks)', () => {
    const max = 5;
    const history = new HistoryManager(max);

    for (let i = 0; i < 15; i++) {
      history.push([createDummyStroke(`s${i}`)]);
    }

    expect(history.getUndoCount()).toBe(max);
  });
});
