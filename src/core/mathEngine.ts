export type MathResult = {
  handled: boolean;
  answer?: string;
};

type Token = number | "+" | "-" | "*" | "/" | "^" | "%" | "(" | ")";

class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.parseAddition();
    if (this.index !== this.tokens.length) throw new Error("Expressão incompleta.");
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) {
      throw new Error("O resultado está fora do intervalo suportado.");
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private take(): Token {
    const token = this.tokens[this.index];
    if (token === undefined) throw new Error("Falta um valor na expressão.");
    this.index += 1;
    return token;
  }

  private parseAddition(): number {
    let value = this.parseMultiplication();
    while (this.peek() === "+" || this.peek() === "-") {
      const operator = this.take();
      const right = this.parseMultiplication();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplication(): number {
    let value = this.parsePower();
    while (this.peek() === "*" || this.peek() === "/") {
      const operator = this.take();
      const right = this.parsePower();
      if (operator === "/" && right === 0) throw new Error("Não é possível dividir por zero.");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private parsePower(): number {
    const value = this.parseUnary();
    if (this.peek() === "^") {
      this.take();
      return Math.pow(value, this.parsePower());
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek() === "+") {
      this.take();
      return this.parseUnary();
    }
    if (this.peek() === "-") {
      this.take();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.take();
    let value: number;
    if (typeof token === "number") {
      value = token;
    } else if (token === "(") {
      value = this.parseAddition();
      if (this.take() !== ")") throw new Error("Falta fechar um parêntese.");
    } else {
      throw new Error("Era esperado um número.");
    }

    while (this.peek() === "%") {
      this.take();
      value /= 100;
    }
    return value;
  }
}

function tokenize(expression: string): Token[] {
  const compact = expression.replace(/\s+/g, "");
  if (!compact || compact.length > 120) throw new Error("A expressão está vazia ou é demasiado longa.");

  const matches = compact.match(/\d+(?:\.\d+)?|[()+\-*/^%]/g) || [];
  if (matches.join("") !== compact || matches.length > 60) {
    throw new Error("Não reconheci todos os elementos da operação.");
  }

  return matches.map(token => {
    if (/^\d/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error("Número inválido.");
      return value;
    }
    return token as Exclude<Token, number>;
  });
}

function normalizeExpression(raw: string): { expression: string; requested: boolean } {
  let value = raw.trim().toLocaleLowerCase("pt-PT");
  const prefix = /^(?:quanto\s+(?:e|é|da|dá)|calcula(?:\s+quanto)?|calcular|resolve|resultado\s+de)\s*/i;
  const requested = prefix.test(value);
  value = value.replace(prefix, "");

  value = value
    .replace(/(\d+(?:[.,]\d+)?)\s+por\s+cento\s+de\s+(\d+(?:[.,]\d+)?)/g, "$1% * $2")
    .replace(/\b(multiplicado\s+por|vezes)\b/g, "*")
    .replace(/\b(dividido\s+por|a\s+dividir\s+por)\b/g, "/")
    .replace(/\belevado\s+a\b/g, "^")
    .replace(/\bmais\b/g, "+")
    .replace(/\bmenos\b/g, "-")
    .replace(/\bpor\s+cento\b/g, "%")
    .replace(/\s+x\s/g, " * ")
    .replace(/,/g, ".")
    .trim();

  return { expression: value, requested };
}

/** Safely evaluates basic arithmetic without eval or external services. */
export function calculateMath(raw: string): MathResult {
  const normalized = normalizeExpression(raw);
  const strictExpression = /^[\d\s.,()+\-*/^%]+$/.test(normalized.expression);
  if (!normalized.requested && !strictExpression) return { handled: false };
  if (!normalized.expression || !/\d/.test(normalized.expression)) {
    return { handled: true, answer: "Diz-me a operação matemática que queres calcular." };
  }

  try {
    const result = new ExpressionParser(tokenize(normalized.expression)).parse();
    const formatted = new Intl.NumberFormat("pt-PT", {
      maximumFractionDigits: 8,
      useGrouping: true
    }).format(result);
    return { handled: true, answer: "O resultado é " + formatted + "." };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Operação inválida.";
    return { handled: true, answer: "Não consegui calcular essa expressão. " + reason };
  }
}
