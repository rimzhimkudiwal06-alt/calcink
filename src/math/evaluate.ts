/**
 * CalcInk Math Engine & Expression Parser
 *
 * Implements a 100% offline, zero-eval recursive descent parser for
 * arithmetic expressions supporting:
 * - Digits 0-9, decimals (.)
 * - Operators: +, -, ×, ÷, *, /
 * - Unary minus/plus (-3+5, 4×-2, 5--3)
 * - Operator precedence (BODMAS / PEMDAS)
 * - Strict left-associativity (10-3-2 = 5, 24/4/2 = 3)
 * - Division by zero detection ("Undefined")
 * - Trailing '=' handling
 * - Malformed input safety (never throws exceptions)
 * - Floating-point noise cleanup (0.1 + 0.2 = 0.3)
 */

import type { EvalResult } from '../types';

/**
 * Token types produced by the lexer.
 */
type TokenType =
  | 'NUMBER'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value?: number;
  raw: string;
  pos: number;
}

/**
 * Strips floating-point representation noise like 0.30000000000000004 -> 0.3.
 *
 * @param num - Raw floating point number
 * @returns Cleaned number with precision artifacts stripped
 */
export function cleanFloat(num: number): number {
  if (!isFinite(num)) return num;
  // Convert -0 to 0
  if (Object.is(num, -0)) return 0;
  // Round within 12 significant digits to eliminate binary IEEE-754 drift
  const cleaned = parseFloat(num.toPrecision(12));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

/**
 * Formats an evaluation number into a clean string for display.
 *
 * @param value - Numeric result
 * @returns Nicely formatted string without trailing zeroes
 */
export function formatResult(value: number): string {
  const cleaned = cleanFloat(value);
  if (!isFinite(cleaned)) return 'Undefined';
  // Avoid exponential notation for normal numbers
  if (Math.abs(cleaned) < 1e12 && Math.abs(cleaned) > 1e-6) {
    return cleaned.toString();
  }
  return cleaned.toString();
}

/**
 * Internal parsing exception used for controlled error propagation.
 * Never leaks outside evaluate().
 */
class ParseError extends Error {
  public readonly isUndefined: boolean;

  constructor(message: string, isUndefined: boolean = false) {
    super(message);
    this.name = 'ParseError';
    this.isUndefined = isUndefined;
  }
}

/**
 * Tokenizes an expression string into an array of lexical tokens.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Single character operators
    if (ch === '+') {
      tokens.push({ type: 'PLUS', raw: '+', pos: i });
      i++;
      continue;
    }

    if (ch === '-') {
      tokens.push({ type: 'MINUS', raw: '-', pos: i });
      i++;
      continue;
    }

    if (ch === '*' || ch === '×') {
      tokens.push({ type: 'MULTIPLY', raw: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '/' || ch === '÷') {
      tokens.push({ type: 'DIVIDE', raw: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', raw: '(', pos: i });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', raw: ')', pos: i });
      i++;
      continue;
    }

    // Number literals (e.g. "42", "3.14", ".5")
    if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(input[i + 1]))) {
      const start = i;
      let dotCount = 0;

      while (i < len && (/\d/.test(input[i]) || input[i] === '.')) {
        if (input[i] === '.') {
          dotCount++;
          if (dotCount > 1) {
            throw new ParseError(`Invalid number with multiple decimals at position ${i}`);
          }
        }
        i++;
      }

      const numStr = input.slice(start, i);
      const numVal = parseFloat(numStr);
      if (isNaN(numVal)) {
        throw new ParseError(`Malformed number at position ${start}`);
      }

      tokens.push({ type: 'NUMBER', value: numVal, raw: numStr, pos: start });
      continue;
    }

    // Stray dot without digits
    if (ch === '.') {
      throw new ParseError(`Unexpected '.' at position ${i}`);
    }

    // Any unrecognized character
    throw new ParseError(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', raw: '', pos: len });
  return tokens;
}

/**
 * Recursive Descent Parser implementing BODMAS/PEMDAS arithmetic grammar:
 *
 * Expr        := Additive
 * Additive    := Multiplicative ( ('+' | '-') Multiplicative )*
 * Multiplicative := Unary ( ('*' | '/' | '×' | '÷') Unary )*
 * Unary       := ('+' | '-') Unary | Primary
 * Primary     := NUMBER | '(' Expr ')'
 */
class Parser {
  private tokens: Token[];
  private cursor: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.cursor] || { type: 'EOF', raw: '', pos: -1 };
  }

  private match(...types: TokenType[]): boolean {
    const cur = this.current();
    if (types.includes(cur.type)) {
      this.cursor++;
      return true;
    }
    return false;
  }

  public parse(): number {
    if (this.current().type === 'EOF') {
      throw new ParseError('Empty expression');
    }

    const result = this.parseAdditive();

    if (this.current().type !== 'EOF') {
      throw new ParseError(`Unexpected token '${this.current().raw}' at position ${this.current().pos}`);
    }

    return result;
  }

  /**
   * Additive expressions (+ and -) evaluated left-to-right.
   */
  private parseAdditive(): number {
    let left = this.parseMultiplicative();

    while (true) {
      if (this.match('PLUS')) {
        const right = this.parseMultiplicative();
        left = left + right;
      } else if (this.match('MINUS')) {
        const right = this.parseMultiplicative();
        left = left - right;
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Multiplicative expressions (*, /, ×, ÷) evaluated left-to-right with division by zero check.
   */
  private parseMultiplicative(): number {
    let left = this.parseUnary();

    while (true) {
      if (this.match('MULTIPLY')) {
        const right = this.parseUnary();
        left = left * right;
      } else if (this.match('DIVIDE')) {
        const right = this.parseUnary();
        // Division by zero check (both integer 0 and IEEE float 0)
        if (right === 0 || !isFinite(left / right)) {
          throw new ParseError('Division by zero', true);
        }
        left = left / right;
      } else {
        break;
      }
    }

    return left;
  }

  /**
   * Unary expressions (+x, -x, --x, 4*-2).
   */
  private parseUnary(): number {
    if (this.match('PLUS')) {
      return this.parseUnary();
    }
    if (this.match('MINUS')) {
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  /**
   * Primary elements (numbers, parenthesized expressions).
   */
  private parsePrimary(): number {
    const token = this.current();

    if (this.match('NUMBER')) {
      return token.value!;
    }

    if (this.match('LPAREN')) {
      const expr = this.parseAdditive();
      if (!this.match('RPAREN')) {
        throw new ParseError(`Mismatched parenthesis: expected ')' at position ${this.current().pos}`);
      }
      return expr;
    }

    if (token.type === 'EOF') {
      throw new ParseError('Unexpected end of expression');
    }

    throw new ParseError(`Unexpected token '${token.raw}' at position ${token.pos}`);
  }
}

/**
 * Evaluates a mathematical expression string and returns an EvalResult.
 *
 * Guarantees:
 * - 100% offline, NEVER uses eval() or new Function()
 * - Never throws an unhandled exception
 * - Returns { ok: false, error: "Undefined" } for division by zero
 * - Returns { ok: false, error: "Syntax error" } for malformed expressions
 * - Cleans IEEE-754 floating point artifacts (e.g. 0.1 + 0.2 -> 0.3)
 * - Automatically ignores an optional trailing '=' sign
 *
 * @param expr - Expression string to evaluate (e.g. "18 + 4 × 3 =")
 * @returns EvalResult object { ok: true, value } or { ok: false, error }
 */
export function evaluate(expr: string): EvalResult {
  if (typeof expr !== 'string') {
    return { ok: false, error: 'Syntax error' };
  }

  // Pre-process: trim whitespace and strip trailing '=' (single or with trailing space)
  let sanitized = expr.trim();
  if (sanitized.endsWith('=')) {
    sanitized = sanitized.slice(0, -1).trim();
  }

  // If '=' is present anywhere inside the expression, that's invalid syntax
  if (sanitized.includes('=')) {
    return { ok: false, error: 'Syntax error' };
  }

  if (sanitized.length === 0) {
    return { ok: false, error: 'Syntax error' };
  }

  try {
    const tokens = tokenize(sanitized);
    const parser = new Parser(tokens);
    const rawResult = parser.parse();

    if (!isFinite(rawResult)) {
      return { ok: false, error: 'Undefined' };
    }

    const value = cleanFloat(rawResult);
    return { ok: true, value };
  } catch (err: unknown) {
    if (err instanceof ParseError && err.isUndefined) {
      return { ok: false, error: 'Undefined' };
    }
    return { ok: false, error: 'Syntax error' };
  }
}
