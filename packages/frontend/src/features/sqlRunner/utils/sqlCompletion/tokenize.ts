export type SqlTokenType =
    | 'word'
    | 'quoted'
    | 'string'
    | 'number'
    | 'parameter'
    | 'comment'
    | 'dot'
    | 'comma'
    | 'lparen'
    | 'rparen'
    | 'semicolon'
    | 'operator';

export type SqlToken = {
    type: SqlTokenType;
    value: string;
    start: number;
    end: number;
    // False for strings, quoted identifiers and block comments missing their terminator
    closed: boolean;
};

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_$]/u;
const DIGIT = /[0-9]/;
const PUNCTUATION: Record<string, SqlTokenType> = {
    '.': 'dot',
    ',': 'comma',
    '(': 'lparen',
    ')': 'rparen',
    ';': 'semicolon',
};

const readUntil = (
    sql: string,
    from: number,
    terminator: string,
): { end: number; closed: boolean } => {
    const index = sql.indexOf(terminator, from);
    return index === -1
        ? { end: sql.length, closed: false }
        : { end: index + terminator.length, closed: true };
};

const readQuoted = (
    sql: string,
    start: number,
    quote: string,
    allowBackslashEscape: boolean,
): { end: number; closed: boolean } => {
    let i = start + 1;
    while (i < sql.length) {
        if (sql[i] === '\\' && allowBackslashEscape) {
            i += 2;
        } else if (sql[i] === quote) {
            // A doubled quote inside the value is an escaped quote; at the
            // start it is an empty value such as '' or an auto-closed pair
            if (sql[i + 1] === quote && i > start + 1) {
                i += 2;
            } else {
                return { end: i + 1, closed: true };
            }
        } else {
            i += 1;
        }
    }
    return { end: sql.length, closed: false };
};

/**
 * Splits SQL into tokens without validating it, so it works on the
 * half-written queries an editor sees while typing.
 */
export const tokenizeSql = (sql: string, quoteChar: string): SqlToken[] => {
    const tokens: SqlToken[] = [];
    let i = 0;
    const push = (
        type: SqlTokenType,
        start: number,
        end: number,
        closed = true,
    ) => {
        tokens.push({ type, value: sql.slice(start, end), start, end, closed });
        i = end;
    };

    while (i < sql.length) {
        const char = sql[i];
        const next = sql[i + 1];
        if (/\s/.test(char)) {
            i += 1;
        } else if (char === '-' && next === '-') {
            const newline = sql.indexOf('\n', i);
            push('comment', i, newline === -1 ? sql.length : newline);
        } else if (char === '/' && next === '*') {
            const { end, closed } = readUntil(sql, i + 2, '*/');
            push('comment', i, end, closed);
        } else if (char === '$' && next === '{') {
            const { end, closed } = readUntil(sql, i + 2, '}');
            push('parameter', i, end, closed);
        } else if (char === quoteChar) {
            const { end, closed } = readQuoted(sql, i, quoteChar, false);
            push('quoted', i, end, closed);
        } else if (char === "'" || char === '"') {
            // Double quotes are strings where identifiers use backticks
            // Backtick dialects (BigQuery, Spark) escape with backslashes
            const { end, closed } = readQuoted(sql, i, char, quoteChar === '`');
            push('string', i, end, closed);
        } else if (
            DIGIT.test(char) ||
            (char === '.' && next !== undefined && DIGIT.test(next))
        ) {
            let end = i + 1;
            while (end < sql.length && /[0-9.eE]/.test(sql[end])) end += 1;
            push('number', i, end);
        } else if (WORD_START.test(char)) {
            let end = i + 1;
            while (end < sql.length && WORD_PART.test(sql[end])) end += 1;
            push('word', i, end);
        } else if (PUNCTUATION[char]) {
            push(PUNCTUATION[char], i, i + 1);
        } else {
            push('operator', i, i + 1);
        }
    }
    return tokens;
};

export const unquoteIdentifier = (
    token: SqlToken,
    quoteChar: string,
): string[] => {
    if (token.type !== 'quoted') return [token.value];
    const inner = token.value.slice(1, token.closed ? -1 : undefined);
    // Backtick warehouses allow a whole path inside one quote: `project.dataset`
    return quoteChar === '`' ? inner.split('.') : [inner];
};
