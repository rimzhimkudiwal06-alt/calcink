/**
 * CalcInk Math Engine & Expression Parser (Phase 6: Variables & Advanced Math)
 *
 * Implements a 100% offline, zero-eval recursive descent parser for:
 * - Digits 0-9, decimals (.)
 * - Operators: +, -, ×, ÷, *, /, ^ (power)
 * - Variables & Scope: (e.g. "x = 10", then "x + 5 =" -> 15)
 * - Implicit multiplication: "2x", "3(x)", "(x+1)(x-1)"
 * - Standard functions: sin, cos, tan, sqrt, abs, ln, log
 * - Unary minus/plus (-3+5, 4×-2, 5--3)
 * - Operator precedence (BODMAS / PEMDAS) & right-associative powers (2^3^2)
 * - Strict left-associativity (10-3-2 = 5, 24/4/2 = 3)
 * - Division by zero detection ("Undefined")
 * - Trailing '=' handling
 * - Malformed input safety (never throws exceptions)
 * - Floating-point noise cleanup (0.1 + 0.2 = 0.3)
 */

import type { EvalResult } from '../types';

/**
 * Extended result type supporting optional variable assignment indicator.
 */
export type ExtendedEvalResult = EvalResult & {
  variable?: string;
};

/**
 * Token types produced by the lexer.
 */
type TokenType =
  | 'NUMBER'
  | 'VARIABLE'
  | 'FUNCTION'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'POWER'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value?: number;
  raw: string;
  pos: number;
}

const KNOWN_FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'ln', 'log']);

/**
 * Strips floating-point representation noise like 0.30000000000000004 -> 0.3.
 */
export function cleanFloat(num: number): number {
  if (!isFinite(num)) return num;
  if (Object.is(num, -0)) return 0;
  const cleaned = parseFloat(num.toPrecision(12));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

/**
 * Formats an evaluation number into a clean string for display.
 */
export function formatResult(value: number): string {
  const cleaned = cleanFloat(value);
  if (!isFinite(cleaned)) return 'Undefined';
  if (Math.abs(cleaned) < 1e12 && Math.abs(cleaned) > 1e-6) {
    return cleaned.toString();
  }
  return cleaned.toString();
}

/**
 * Internal parsing exception used for controlled error propagation.
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
 * Tokenizes an expression string into an array of lexical tokens,
 * automatically inserting implicit multiplication tokens where standard in math notation.
 */
function tokenize(input: string): Token[] {
  const rawTokens: Token[] = [];
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
      rawTokens.push({ type: 'PLUS', raw: '+', pos: i });
      i++;
      continue;
    }

    if (ch === '-') {
      rawTokens.push({ type: 'MINUS', raw: '-', pos: i });
      i++;
      continue;
    }

    if (ch === '*' || ch === '×') {
      rawTokens.push({ type: 'MULTIPLY', raw: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '/' || ch === '÷') {
      rawTokens.push({ type: 'DIVIDE', raw: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '^') {
      rawTokens.push({ type: 'POWER', raw: '^', pos: i });
      i++;
      continue;
    }

    if (ch === '(') {
      rawTokens.push({ type: 'LPAREN', raw: '(', pos: i });
      i++;
      continue;
    }

    if (ch === ')') {
      rawTokens.push({ type: 'RPAREN', raw: ')', pos: i });
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

      rawTokens.push({ type: 'NUMBER', value: numVal, raw: numStr, pos: start });
      continue;
    }

    // Identifiers (Variables and Math Functions, e.g. "x", "y", "radius", "sin")
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      while (i < len && /[a-zA-Z0-9]/.test(input[i])) {
        i++;
      }
      const rawName = input.slice(start, i);
      const lowerName = rawName.toLowerCase();

      if (KNOWN_FUNCTIONS.has(lowerName)) {
        rawTokens.push({ type: 'FUNCTION', raw: lowerName, pos: start });
      } else {
        rawTokens.push({ type: 'VARIABLE', raw: lowerName, pos: start });
      }
      continue;
    }

    // Stray dot without digits
    if (ch === '.') {
      throw new ParseError(`Unexpected '.' at position ${i}`);
    }

    throw new ParseError(`Unexpected character '${ch}' at position ${i}`);
  }

  // Insert implicit multiplication: e.g. "2x" -> 2 * x, "2(3)" -> 2 * (3), "x(y)" -> x * (y)
  const tokens: Token[] = [];
  for (let idx = 0; idx < rawTokens.length; idx++) {
    const cur = rawTokens[idx];
    tokens.push(cur);

    if (idx < rawTokens.length - 1) {
      const next = rawTokens[idx + 1];
      const curCanMultiply =
        cur.type === 'NUMBER' || cur.type === 'VARIABLE' || cur.type === 'RPAREN';
      const nextCanMultiply =
        next.type === 'VARIABLE' || next.type === 'FUNCTION' || next.type === 'LPAREN';

      if (curCanMultiply && nextCanMultiply) {
        tokens.push({ type: 'MULTIPLY', raw: '*', pos: next.pos });
      }
    }
  }

  tokens.push({ type: 'EOF', raw: '', pos: len });
  return tokens;
}

/**
 * Recursive Descent Parser with Variables & Operator Precedence:
 *
 * Expr          := Additive
 * Additive      := Multiplicative ( ('+' | '-') Multiplicative )*
 * Multiplicative:= Power ( ('*' | '/' | '×' | '÷') Power )*
 * Power         := Unary ( '^' Power )?   (Right-associative)
 * Unary         := ('+' | '-') Unary | Primary
 * Primary       := NUMBER | VARIABLE | FUNCTION '(' Expr ')' | '(' Expr ')'
 */
class Parser {
  private tokens: Token[];
  private cursor: number = 0;
  private scope: Record<string, number>;

  constructor(tokens: Token[], scope: Record<string, number> = {}) {
    this.tokens = tokens;
    this.scope = scope;
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
      throw new ParseError(
        `Unexpected token '${this.current().raw}' at position ${this.current().pos}`
      );
    }

    return result;
  }

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

  private parseMultiplicative(): number {
    let left = this.parsePower();

    while (true) {
      if (this.match('MULTIPLY')) {
        const right = this.parsePower();
        left = left * right;
      } else if (this.match('DIVIDE')) {
        const right = this.parsePower();
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

  private parsePower(): number {
    const left = this.parseUnary();

    if (this.match('POWER')) {
      const right = this.parsePower(); // Right-associative exponentiation
      const result = Math.pow(left, right);
      if (!isFinite(result)) {
        throw new ParseError('Arithmetic overflow in power operation');
      }
      return result;
    }

    return left;
  }

  private parseUnary(): number {
    if (this.match('PLUS')) {
      return this.parseUnary();
    }
    if (this.match('MINUS')) {
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.current();

    if (this.match('NUMBER')) {
      return token.value!;
    }

    if (this.match('VARIABLE')) {
      const varName = token.raw.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(this.scope, varName)) {
        const val = this.scope[varName];
        if (typeof val === 'number' && isFinite(val)) {
          return val;
        }
      }
      throw new ParseError(`Undefined variable '${token.raw}'`);
    }

    if (this.match('FUNCTION')) {
      const fnName = token.raw.toLowerCase();
      if (!this.match('LPAREN')) {
        throw new ParseError(`Expected '(' after function '${fnName}'`);
      }
      const arg = this.parseAdditive();
      if (!this.match('RPAREN')) {
        throw new ParseError(`Mismatched parenthesis: expected ')' after function argument`);
      }

      switch (fnName) {
        case 'sin':
          return Math.sin(arg);
        case 'cos':
          return Math.cos(arg);
        case 'tan':
          return Math.tan(arg);
        case 'sqrt':
          if (arg < 0) throw new ParseError('Square root of negative number', true);
          return Math.sqrt(arg);
        case 'abs':
          return Math.abs(arg);
        case 'ln':
          if (arg <= 0) throw new ParseError('Natural logarithm of non-positive number', true);
          return Math.log(arg);
        case 'log':
          if (arg <= 0) throw new ParseError('Logarithm of non-positive number', true);
          return Math.log10(arg);
        default:
          throw new ParseError(`Unknown function '${fnName}'`);
      }
    }

    if (this.match('LPAREN')) {
      const expr = this.parseAdditive();
      if (!this.match('RPAREN')) {
        throw new ParseError(
          `Mismatched parenthesis: expected ')' at position ${this.current().pos}`
        );
      }
      return expr;
    }

    if (token.type === 'EOF') {
      throw new ParseError('Unexpected end of expression');
    }

    throw new ParseError(`Unexpected token '${token.raw}' at position ${token.pos}`);
  }
}

export interface Assignment {
  variable: string;
  expression: string;
}

/**
 * Checks whether an expression string is a variable assignment (e.g. "x = 10", "y = 2x + 1").
 *
 * @param expr - Expression string
 * @returns Assignment details or null if standard equation
 */
export function parseAssignment(expr: string): Assignment | null {
  if (typeof expr !== 'string') return null;

  let sanitized = expr.trim();
  if (sanitized.endsWith('=')) {
    sanitized = sanitized.slice(0, -1).trim();
  }

  const eqIdx = sanitized.indexOf('=');
  if (eqIdx === -1) return null;

  const lhs = sanitized.slice(0, eqIdx).trim();
  const rhs = sanitized.slice(eqIdx + 1).trim();

  // LHS must be a valid single identifier
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(lhs)) {
    return null;
  }

  // RHS must not be empty or contain additional '='
  if (!rhs || rhs.includes('=')) {
    return null;
  }

  return {
    variable: lhs.toLowerCase(),
    expression: rhs,
  };
}

/**
 * Evaluates a mathematical expression string within an optional variable scope.
 *
 * Supports:
 * - Direct expressions: "18 + 4 * 3 =" -> 30
 * - Variables in expressions: "x + 5 =" with { x: 10 } -> 15
 * - Assignments: "x = 10" -> stores x: 10 in scope and returns 10
 * - Implicit multiplication: "2x" with { x: 3 } -> 6
 * - Exponentiation: "x^2" with { x: 4 } -> 16
 *
 * @param expr - Expression string to evaluate
 * @param scope - Optional variable key-value map
 * @returns ExtendedEvalResult with status and evaluated value
 */
export function evaluate(
  expr: string,
  scope: Record<string, number> = {}
): ExtendedEvalResult {
  if (typeof expr !== 'string') {
    return { ok: false, error: 'Syntax error' };
  }

  // Check for variable assignment: e.g. "x = 10", "y = 2x + 1"
  const assignment = parseAssignment(expr);
  if (assignment) {
    const rhsResult = evaluate(assignment.expression, scope);
    if (rhsResult.ok) {
      scope[assignment.variable] = rhsResult.value;
      return {
        ok: true,
        value: rhsResult.value,
        variable: assignment.variable,
      };
    }
    return rhsResult;
  }

  // Pre-process: strip trailing '='
  let sanitized = expr.trim();
  if (sanitized.endsWith('=')) {
    sanitized = sanitized.slice(0, -1).trim();
  }

  if (sanitized.includes('=')) {
    return { ok: false, error: 'Syntax error' };
  }

  if (sanitized.length === 0) {
    return { ok: false, error: 'Syntax error' };
  }

  try {
    const tokens = tokenize(sanitized);
    const parser = new Parser(tokens, scope);
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
