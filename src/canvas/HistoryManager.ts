/**
 * CalcInk Undo / Redo History Manager
 *
 * Implements a bounded two-stack state history for strokes.
 * Caps history length to prevent memory leaks (Rule 7).
 */

import type { Stroke } from '../types';

/**
 * Creates a deep copy of a stroke collection to guarantee immutability.
 */
function cloneStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((s) => ({
    id: s.id,
    width: s.width,
    color: s.color,
    points: s.points.map((p) => ({ ...p })),
  }));
}

export class HistoryManager {
  private undoStack: Stroke[][] = [];
  private redoStack: Stroke[][] = [];
  private readonly maxHistory: number;

  /**
   * @param maxHistory - Maximum number of undo states retained (default: 50)
   */
  constructor(maxHistory: number = 50) {
    this.maxHistory = Math.max(5, maxHistory);
  }

  /**
   * Pushes the state prior to an edit onto the undo stack.
   * Clears the redo stack whenever a new user action occurs.
   *
   * @param previousState - The snapshot of strokes before the change
   */
  public push(previousState: Stroke[]): void {
    this.undoStack.push(cloneStrokes(previousState));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift(); // Drop oldest state to cap memory
    }
    this.redoStack = []; // Clear redo branch on new action
  }

  /**
   * Undoes the last action.
   *
   * @param currentState - The current stroke list on canvas
   * @returns The restored previous stroke state, or null if cannot undo
   */
  public undo(currentState: Stroke[]): Stroke[] | null {
    if (!this.canUndo()) return null;

    const previousState = this.undoStack.pop()!;
    this.redoStack.push(cloneStrokes(currentState));

    if (this.redoStack.length > this.maxHistory) {
      this.redoStack.shift();
    }

    return cloneStrokes(previousState);
  }

  /**
   * Redoes the previously undone action.
   *
   * @param currentState - The current stroke list on canvas
   * @returns The restored next stroke state, or null if cannot redo
   */
  public redo(currentState: Stroke[]): Stroke[] | null {
    if (!this.canRedo()) return null;

    const nextState = this.redoStack.pop()!;
    this.undoStack.push(cloneStrokes(currentState));

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    return cloneStrokes(nextState);
  }

  /**
   * Returns true if there are actions that can be undone.
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Returns true if there are actions that can be redone.
   */
  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clears both undo and redo stacks.
   */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Returns the number of available undo steps.
   */
  public getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Returns the number of available redo steps.
   */
  public getRedoCount(): number {
    return this.redoStack.length;
  }
}
