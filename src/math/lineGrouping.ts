/**
 * CalcInk Line Grouping & Expression Extraction Engine
 *
 * Provides pure algorithms for:
 * 1. Grouping unordered 2D RecognizedSymbols into horizontal equation lines.
 * 2. Sorting symbols strictly left-to-right within each line.
 * 3. Detecting the terminal '=' sign.
 * 4. Building the arithmetic expression string.
 * 5. Evaluating the expression via evaluate() with "Undefined" and "?" fallbacks.
 * 6. Calculating the exact placement coordinates (x, baselineY, fontSize) for the answer overlay.
 */

import type { RecognizedSymbol, EvalResult } from '../types';
import { evaluate, formatResult } from './evaluate';

/**
 * Result of evaluating an equation extracted from recognized handwriting symbols.
 */
export interface EquationResult {
  /** The unique key or index for this equation line */
  id: string;
  /** The raw expression string evaluated (e.g. "18+4×3") */
  expression: string;
  /** Evaluation result from evaluate() */
  evalResult: EvalResult;
  /** Text to display on canvas (e.g. "30", "Undefined", or "?") */
  displayText: string;
  /** Result classification for UI styling */
  status: 'success' | 'undefined' | 'syntax-error';
  /** X coordinate in canvas CSS pixels (just right of '=') */
  x: number;
  /** Baseline Y coordinate in canvas CSS pixels */
  baselineY: number;
  /** Font size scaled to the equation height in CSS pixels */
  fontSize: number;
  /** Bounding box of the terminal '=' symbol */
  equalsBbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/**
 * Determines whether a symbol vertically overlaps with an existing line's vertical bounds.
 *
 * @param lineMinY - Top edge of the line
 * @param lineMaxY - Bottom edge of the line
 * @param symY - Top edge of the candidate symbol
 * @param symH - Height of the candidate symbol
 * @returns True if symbol belongs to the same horizontal line
 */
export function isVerticallyAligned(
  lineMinY: number,
  lineMaxY: number,
  symY: number,
  symH: number
): boolean {
  const symMaxY = symY + symH;
  const symMidY = symY + symH / 2;

  // Case 1: Symbol midpoint falls within line vertical span
  if (symMidY >= lineMinY && symMidY <= lineMaxY) {
    return true;
  }

  // Case 2: Line vertical midpoint falls within symbol vertical span
  const lineMidY = (lineMinY + lineMaxY) / 2;
  if (lineMidY >= symY && lineMidY <= symMaxY) {
    return true;
  }

  // Case 3: Significant vertical overlap (> 35% of smaller height)
  const overlapMin = Math.max(lineMinY, symY);
  const overlapMax = Math.min(lineMaxY, symMaxY);
  const overlap = Math.max(0, overlapMax - overlapMin);
  const minHeight = Math.min(lineMaxY - lineMinY, symH);

  if (minHeight > 0 && overlap / minHeight > 0.35) {
    return true;
  }

  return false;
}

/**
 * Groups recognized symbols into distinct horizontal lines and sorts them:
 * - Lines are sorted top-to-bottom by vertical position.
 * - Symbols within each line are sorted left-to-right by horizontal position (`bbox.x`).
 *
 * @param symbols - Array of recognized symbols from recognition service
 * @returns Array of symbol arrays, where each inner array represents one line
 */
export function groupSymbolsIntoLines(symbols: RecognizedSymbol[]): RecognizedSymbol[][] {
  if (!symbols || symbols.length === 0) {
    return [];
  }

  // Intermediate representation of a line during grouping
  interface MutableLine {
    minY: number;
    maxY: number;
    symbols: RecognizedSymbol[];
  }

  const lines: MutableLine[] = [];

  // Sort candidate symbols primarily by vertical midpoint to group systematically
  const sortedByY = [...symbols].sort((a, b) => {
    const aMid = a.bbox.y + a.bbox.h / 2;
    const bMid = b.bbox.y + b.bbox.h / 2;
    return aMid - bMid;
  });

  for (const sym of sortedByY) {
    let matchedLine: MutableLine | null = null;
    let maxOverlap = -1;

    for (const line of lines) {
      if (isVerticallyAligned(line.minY, line.maxY, sym.bbox.y, sym.bbox.h)) {
        // Measure overlap amount to pick the best line if multiple match
        const overlap = Math.min(line.maxY, sym.bbox.y + sym.bbox.h) - Math.max(line.minY, sym.bbox.y);
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          matchedLine = line;
        }
      }
    }

    if (matchedLine) {
      matchedLine.symbols.push(sym);
      matchedLine.minY = Math.min(matchedLine.minY, sym.bbox.y);
      matchedLine.maxY = Math.max(matchedLine.maxY, sym.bbox.y + sym.bbox.h);
    } else {
      lines.push({
        minY: sym.bbox.y,
        maxY: sym.bbox.y + sym.bbox.h,
        symbols: [sym],
      });
    }
  }

  // Sort lines top to bottom by minY
  lines.sort((a, b) => a.minY - b.minY);

  // Sort symbols within each line strictly left to right by bbox.x
  return lines.map((line) => {
    return line.symbols.sort((a, b) => a.bbox.x - b.bbox.x);
  });
}

/**
 * Finds the terminal '=' sign in a sorted line of symbols and extracts the expression preceding it.
 *
 * @param lineSymbols - Array of symbols sorted left to right
 * @returns Expression details and terminal '=' symbol, or null if no valid equation found
 */
export function extractEquationFromLine(
  lineSymbols: RecognizedSymbol[]
): {
  expression: string;
  equalsSymbol: RecognizedSymbol;
  precedingSymbols: RecognizedSymbol[];
} | null {
  if (!lineSymbols || lineSymbols.length === 0) {
    return null;
  }

  // Find the last '=' symbol in the line (terminal '=')
  let lastEqualsIdx = -1;
  for (let i = lineSymbols.length - 1; i >= 0; i--) {
    if (lineSymbols[i].char === '=') {
      lastEqualsIdx = i;
      break;
    }
  }

  // If no '=' was found, this line is not ready for evaluation
  if (lastEqualsIdx === -1) {
    return null;
  }

  const equalsSymbol = lineSymbols[lastEqualsIdx];
  const precedingSymbols = lineSymbols.slice(0, lastEqualsIdx);

  // If there are no symbols before '=', we cannot evaluate an expression
  if (precedingSymbols.length === 0) {
    return null;
  }

  // Case 1: '=' is terminal symbol (e.g. "18+4×3 =", "x+5 =", "x=10 =")
  if (lastEqualsIdx === lineSymbols.length - 1) {
    const expression = precedingSymbols.map((s) => s.char).join('');
    return {
      expression,
      equalsSymbol,
      precedingSymbols,
    };
  }

  // Case 2: Variable assignment without trailing '=' (e.g. "x = 10")
  const precedingText = precedingSymbols.map((s) => s.char).join('').trim();
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(precedingText)) {
    const followingSymbols = lineSymbols.slice(lastEqualsIdx + 1);
    const rhs = followingSymbols.map((s) => s.char).join('').trim();
    if (rhs.length > 0) {
      return {
        expression: `${precedingText}=${rhs}`,
        equalsSymbol: followingSymbols[followingSymbols.length - 1],
        precedingSymbols: lineSymbols,
      };
    }
  }

  return null;
}

/**
 * Computes the placement coordinates and font size for rendering the answer.
 *
 * Positioning rules:
 * - x: Just right of the '=' bounding box (plus spacing gap).
 * - fontSize: Scaled proportionally to the equation line height (clamped between 18px and 60px).
 * - baselineY: Aligned with the equation baseline (near the bottom of standard digits / centered on '=').
 *
 * @param precedingSymbols - Symbols before '='
 * @param equalsSymbol - Terminal '=' symbol
 * @returns Object with x, baselineY, and fontSize
 */
export function calculateAnswerPlacement(
  precedingSymbols: RecognizedSymbol[],
  equalsSymbol: RecognizedSymbol
): {
  x: number;
  baselineY: number;
  fontSize: number;
} {
  // Compute vertical bounds of the equation
  let minY = equalsSymbol.bbox.y;
  let maxY = equalsSymbol.bbox.y + equalsSymbol.bbox.h;

  for (const sym of precedingSymbols) {
    if (sym.bbox.y < minY) minY = sym.bbox.y;
    if (sym.bbox.y + sym.bbox.h > maxY) maxY = sym.bbox.y + sym.bbox.h;
  }

  const equationHeight = Math.max(24, maxY - minY);

  // Font size scaled to ~75% of equation height, bounded for legibility
  const fontSize = Math.max(18, Math.min(60, Math.round(equationHeight * 0.78)));

  // Answer placed to the right of '=' with spacing proportional to font size
  const gap = Math.max(10, Math.round(fontSize * 0.35));
  const x = equalsSymbol.bbox.x + equalsSymbol.bbox.w + gap;

  // Optical baseline alignment:
  // The center of '=' corresponds to the mathematical axis.
  // In typography, the alphabetic baseline sits approximately 0.35 * fontSize below the math axis.
  const equalsCenterY = equalsSymbol.bbox.y + equalsSymbol.bbox.h / 2;
  const baselineY = equalsCenterY + fontSize * 0.34;

  return {
    x,
    baselineY,
    fontSize,
  };
}

/**
 * Minimum confidence required for a recognized symbol to be processed.
 * Filters out low-confidence hallucinations and background noise from Person B's neural net.
 */
export const MIN_SYMBOL_CONFIDENCE = 0.4;

/**
 * Validates whether a recognized symbol has plausible geometry, a non-empty character,
 * and meets the minimum confidence threshold.
 *
 * @param sym - Candidate symbol
 * @returns True if symbol is valid for mathematical equation grouping
 */
export function isValidSymbol(sym: RecognizedSymbol): boolean {
  if (!sym || typeof sym.char !== 'string' || sym.char.trim() === '') {
    return false;
  }
  if (typeof sym.confidence === 'number' && (Number.isNaN(sym.confidence) || sym.confidence < MIN_SYMBOL_CONFIDENCE)) {
    return false;
  }
  const { bbox } = sym;
  if (!bbox) {
    return false;
  }
  if (
    !Number.isFinite(bbox.x) ||
    !Number.isFinite(bbox.y) ||
    !Number.isFinite(bbox.w) ||
    !Number.isFinite(bbox.h) ||
    bbox.w <= 0 ||
    bbox.h <= 0
  ) {
    return false;
  }
  return true;
}

/**
 * End-to-end pipeline: Takes recognized symbols, groups them into lines,
 * extracts equations, evaluates them, and returns render-ready EquationResults.
 *
 * Handles:
 * - Evaluation success -> formatted numeric value
 * - Division by zero -> "Undefined"
 * - Syntax errors -> subtle "?"
 *
 * @param symbols - Array of recognized symbols
 * @returns Array of EquationResults ready for the AnswerLayer
 */
export function processSymbols(
  symbols: RecognizedSymbol[],
  scope: Record<string, number> = {}
): EquationResult[] {
  if (!symbols || symbols.length === 0) {
    return [];
  }

  // Filter out noise, low-confidence symbols (<0.40), and malformed bounding boxes
  const validSymbols = symbols.filter(isValidSymbol);
  if (validSymbols.length === 0) {
    return [];
  }

  const lines = groupSymbolsIntoLines(validSymbols);
  const results: EquationResult[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const equationData = extractEquationFromLine(line);

    if (!equationData) {
      continue;
    }

    const { expression, equalsSymbol, precedingSymbols } = equationData;
    const evalResult = evaluate(expression, scope);

    let displayText: string;
    let status: 'success' | 'undefined' | 'syntax-error';

    if (evalResult.ok) {
      displayText = formatResult(evalResult.value);
      status = 'success';
    } else if (evalResult.error === 'Undefined') {
      displayText = 'Undefined';
      status = 'undefined';
    } else {
      // Syntax error or incomplete formula: display subtle '?'
      displayText = '?';
      status = 'syntax-error';
    }

    const { x, baselineY, fontSize } = calculateAnswerPlacement(
      precedingSymbols,
      equalsSymbol
    );

    results.push({
      id: `eq_${lineIdx}_${equalsSymbol.bbox.x}_${equalsSymbol.bbox.y}`,
      expression,
      evalResult,
      displayText,
      status,
      x,
      baselineY,
      fontSize,
      equalsBbox: { ...equalsSymbol.bbox },
    });
  }

  return results;
}
