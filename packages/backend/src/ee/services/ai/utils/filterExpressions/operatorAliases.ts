import {
    filterExpressionOperatorDefinitions,
    FilterOperator,
    type FilterExpressionOperator,
} from '@lightdash/common';

const normalizeOperatorToken = (token: string): string =>
    token.toLowerCase().replace(/[\s_-]+/g, '');

// Spellings agents reach for from SQL, REST filter APIs, and prose. Keyed by
// the normalized token (lowercase, no whitespace/underscores/hyphens).
const operatorAliases: Record<string, FilterExpressionOperator> = {
    '=': FilterOperator.EQUALS,
    '==': FilterOperator.EQUALS,
    '===': FilterOperator.EQUALS,
    eq: FilterOperator.EQUALS,
    equal: FilterOperator.EQUALS,
    equalto: FilterOperator.EQUALS,
    is: FilterOperator.EQUALS,
    in: FilterOperator.EQUALS,
    oneof: FilterOperator.EQUALS,
    '!=': FilterOperator.NOT_EQUALS,
    '!==': FilterOperator.NOT_EQUALS,
    '<>': FilterOperator.NOT_EQUALS,
    ne: FilterOperator.NOT_EQUALS,
    neq: FilterOperator.NOT_EQUALS,
    notequal: FilterOperator.NOT_EQUALS,
    notequalto: FilterOperator.NOT_EQUALS,
    isnot: FilterOperator.NOT_EQUALS,
    notin: FilterOperator.NOT_EQUALS,
    contains: FilterOperator.INCLUDE,
    contain: FilterOperator.INCLUDE,
    includes: FilterOperator.INCLUDE,
    like: FilterOperator.INCLUDE,
    ilike: FilterOperator.INCLUDE,
    notcontains: FilterOperator.NOT_INCLUDE,
    notcontain: FilterOperator.NOT_INCLUDE,
    doesnotcontain: FilterOperator.NOT_INCLUDE,
    notincludes: FilterOperator.NOT_INCLUDE,
    notinclude: FilterOperator.NOT_INCLUDE,
    notlike: FilterOperator.NOT_INCLUDE,
    excludes: FilterOperator.NOT_INCLUDE,
    '>': FilterOperator.GREATER_THAN,
    gt: FilterOperator.GREATER_THAN,
    greater: FilterOperator.GREATER_THAN,
    morethan: FilterOperator.GREATER_THAN,
    '>=': FilterOperator.GREATER_THAN_OR_EQUAL,
    '=>': FilterOperator.GREATER_THAN_OR_EQUAL,
    gte: FilterOperator.GREATER_THAN_OR_EQUAL,
    ge: FilterOperator.GREATER_THAN_OR_EQUAL,
    atleast: FilterOperator.GREATER_THAN_OR_EQUAL,
    greaterthanorequals: FilterOperator.GREATER_THAN_OR_EQUAL,
    greaterthanorequalto: FilterOperator.GREATER_THAN_OR_EQUAL,
    '<': FilterOperator.LESS_THAN,
    lt: FilterOperator.LESS_THAN,
    less: FilterOperator.LESS_THAN,
    '<=': FilterOperator.LESS_THAN_OR_EQUAL,
    '=<': FilterOperator.LESS_THAN_OR_EQUAL,
    lte: FilterOperator.LESS_THAN_OR_EQUAL,
    le: FilterOperator.LESS_THAN_OR_EQUAL,
    atmost: FilterOperator.LESS_THAN_OR_EQUAL,
    lessthanorequals: FilterOperator.LESS_THAN_OR_EQUAL,
    lessthanorequalto: FilterOperator.LESS_THAN_OR_EQUAL,
    between: FilterOperator.IN_BETWEEN,
    notbetween: FilterOperator.NOT_IN_BETWEEN,
    beginswith: FilterOperator.STARTS_WITH,
    null: FilterOperator.NULL,
    isempty: FilterOperator.NULL,
    empty: FilterOperator.NULL,
    isnotnull: FilterOperator.NOT_NULL,
    notempty: FilterOperator.NOT_NULL,
    isnotempty: FilterOperator.NOT_NULL,
    last: FilterOperator.IN_THE_PAST,
    past: FilterOperator.IN_THE_PAST,
    inlast: FilterOperator.IN_THE_PAST,
    inthelast: FilterOperator.IN_THE_PAST,
    notinlast: FilterOperator.NOT_IN_THE_PAST,
    notinthelast: FilterOperator.NOT_IN_THE_PAST,
    next: FilterOperator.IN_THE_NEXT,
    this: FilterOperator.IN_THE_CURRENT,
    current: FilterOperator.IN_THE_CURRENT,
};

// Case and separator variants of the canonical names (`Equals`, `in_the_past`)
// resolve to the canonical spelling.
const canonicalOperatorsByNormalizedName: Record<
    string,
    FilterExpressionOperator
> = Object.fromEntries(
    filterExpressionOperatorDefinitions.map(({ operator }) => [
        normalizeOperatorToken(operator),
        operator,
    ]),
);

export const resolveOperatorAlias = (
    token: string,
): FilterExpressionOperator | null => {
    const normalized = normalizeOperatorToken(token);
    return (
        canonicalOperatorsByNormalizedName[normalized] ??
        operatorAliases[normalized] ??
        null
    );
};

export type OperatorAliasMatch = {
    alias: string;
    operator: FilterExpressionOperator;
    /** Offset just past the alias token. */
    end: number;
};

const symbolAliasPattern = /^(===|==|=>|=<|!==|!=|<>|>=|<=|=|>|<)/;
const wordPattern = /[A-Za-z_]+/y;
const wordSeparatorPattern = /[ \t]+/y;
const identifierCharacterPattern = /[A-Za-z0-9_.-]/;

const MAX_ALIAS_WORDS = 3;

const readWords = (
    expression: string,
    offset: number,
): { text: string; end: number }[] => {
    const words: { text: string; end: number }[] = [];
    let position = offset;
    for (let count = 0; count < MAX_ALIAS_WORDS; count += 1) {
        if (count > 0) {
            wordSeparatorPattern.lastIndex = position;
            const separator = wordSeparatorPattern.exec(expression);
            if (!separator) {
                break;
            }
            position = wordSeparatorPattern.lastIndex;
        }
        wordPattern.lastIndex = position;
        const word = wordPattern.exec(expression);
        if (!word || word.index !== position) {
            break;
        }
        position = wordPattern.lastIndex;
        const next = expression[position];
        if (next !== undefined && identifierCharacterPattern.test(next)) {
            break;
        }
        words.push({ text: expression.slice(offset, position), end: position });
    }
    return words;
};

/**
 * Recognizes an unsupported operator spelling at the parser's failure offset.
 * Longer multi-word phrases win (`is not null` before `is`).
 */
export const matchOperatorAlias = (
    expression: string,
    offset: number,
): OperatorAliasMatch | null => {
    const symbol = symbolAliasPattern.exec(expression.slice(offset));
    if (symbol) {
        const alias = symbol[1];
        const operator = resolveOperatorAlias(alias);
        return operator
            ? { alias, operator, end: offset + alias.length }
            : null;
    }

    const match = readWords(expression, offset)
        .reverse()
        .flatMap(({ text, end }) => {
            const operator = resolveOperatorAlias(text);
            return operator ? [{ alias: text, operator, end }] : [];
        })[0];
    return match ?? null;
};

const quoteCharacters = new Set(["'", '"', '`']);
const connectorPattern = /[ \t\r\n]+(?:AND|OR)[ \t\r\n]+/iy;

/**
 * Offset where the rule starting before `from` ends: the whitespace before
 * the next unquoted AND/OR connector, or the end of the expression.
 */
export const findRuleEnd = (expression: string, from: number): number => {
    let quote: string | null = null;
    for (let index = from; index < expression.length; index += 1) {
        const character = expression[index];
        if (quote !== null) {
            if (character === '\\') {
                index += 1;
            } else if (character === quote) {
                quote = null;
            }
        } else if (quoteCharacters.has(character)) {
            quote = character;
        } else {
            connectorPattern.lastIndex = index;
            if (connectorPattern.test(expression)) {
                return index;
            }
        }
    }
    return expression.length;
};

/**
 * Offset where the rule containing `offset` starts: the field token that
 * precedes the operator, including a backtick-quoted field.
 */
export const findRuleStart = (expression: string, offset: number): number => {
    let index = offset;
    while (index > 0 && /[ \t\r\n]/.test(expression[index - 1])) {
        index -= 1;
    }
    if (expression[index - 1] === '`') {
        const closingQuote = index - 1;
        let openingQuote = closingQuote - 1;
        while (openingQuote >= 0 && expression[openingQuote] !== '`') {
            openingQuote -= 1;
        }
        return Math.max(openingQuote, 0);
    }
    while (
        index > 0 &&
        identifierCharacterPattern.test(expression[index - 1])
    ) {
        index -= 1;
    }
    return index;
};

const valueSeparatorPattern = /^[ \t]*[=:]?[ \t]*/;

/** Offset where the rule's values start after an alias token. */
export const findValueStart = (
    expression: string,
    aliasEnd: number,
): number => {
    const separator = valueSeparatorPattern.exec(expression.slice(aliasEnd));
    return aliasEnd + (separator?.[0].length ?? 0);
};

/** SQL-style `IN (a, b)` lists become the grammar's bare `a, b`. */
export const stripValueParentheses = (values: string): string => {
    const trimmed = values.trim();
    return trimmed.startsWith('(') && trimmed.endsWith(')')
        ? trimmed.slice(1, -1).trim()
        : trimmed;
};
