import {
    parseQualifiedPrefix,
    type QualifiedPrefix,
} from '../sqlCompletionScope';
import { tokenizeSql, unquoteIdentifier, type SqlToken } from './tokenize';
import {
    AFTER_TABLE_KEYWORDS,
    AFTER_VALUE_KEYWORDS,
    RESERVED_WORDS,
    STATEMENT_START_KEYWORDS,
    VALUE_ENDING_WORDS,
    VALUE_START_KEYWORDS,
} from './vocabulary';

export type TableReference = {
    // Unquoted path segments, e.g. ['silver', 'orders']; empty for subqueries
    path: string[];
    alias: string | null;
    // Output columns of a subquery or CTE; null for warehouse tables
    columns: string[] | null;
};

export type CteDefinition = { name: string; columns: string[] };

export type ValueClause = keyof typeof AFTER_VALUE_KEYWORDS;

export type CursorExpectation =
    | { kind: 'none' }
    | { kind: 'parameter' }
    | { kind: 'keyword'; keywords: string[] }
    | { kind: 'table' }
    | { kind: 'value'; clause: ValueClause; keywords: string[] };

export type CompletionContext = {
    expectation: CursorExpectation;
    prefix: QualifiedPrefix;
    // Tables of the query block around the cursor, CTE references resolved
    tables: TableReference[];
    ctes: CteDefinition[];
    // True right after a clause keyword or separator, where typing a space
    // should open the suggestion list
    followsSeparator: boolean;
};

type Clause =
    | 'select'
    | 'from'
    | 'join'
    | 'on'
    | 'using'
    | 'where'
    | 'groupBy'
    | 'having'
    | 'orderBy'
    | 'limit'
    | 'with'
    | 'setOperation';

const CLAUSE_WORDS: Record<string, Clause> = {
    SELECT: 'select',
    FROM: 'from',
    JOIN: 'join',
    ON: 'on',
    USING: 'using',
    WHERE: 'where',
    GROUP: 'groupBy',
    HAVING: 'having',
    QUALIFY: 'having',
    ORDER: 'orderBy',
    LIMIT: 'limit',
    OFFSET: 'limit',
    FETCH: 'limit',
    WINDOW: 'limit',
    WITH: 'with',
    UNION: 'setOperation',
    INTERSECT: 'setOperation',
    EXCEPT: 'setOperation',
};

const SEPARATOR_WORDS = new Set([
    'SELECT',
    'FROM',
    'JOIN',
    'ON',
    'WHERE',
    'BY',
    'HAVING',
    'QUALIFY',
    'AND',
    'OR',
    'WHEN',
    'THEN',
    'ELSE',
]);

const JOIN_MODIFIERS = new Set([
    'LEFT',
    'RIGHT',
    'INNER',
    'FULL',
    'OUTER',
    'CROSS',
    'NATURAL',
]);

const upper = (token: SqlToken | undefined) =>
    token?.type === 'word' ? token.value.toUpperCase() : null;

const isWord = (token: SqlToken | undefined, ...words: string[]) => {
    const value = upper(token);
    return value !== null && words.includes(value);
};

const isIdentifier = (token: SqlToken | undefined) =>
    token !== undefined &&
    (token.type === 'quoted' ||
        (token.type === 'word' && !RESERVED_WORDS.has(upper(token)!)));

// Clause started by the token at `index`, ignoring look-alikes such as
// BigQuery's `SELECT * EXCEPT (col)`, `WITHIN GROUP` and `IS DISTINCT FROM`
const clauseAt = (tokens: SqlToken[], index: number): Clause | null => {
    const word = upper(tokens[index]);
    const clause = word ? CLAUSE_WORDS[word] : undefined;
    if (!clause) return null;
    if (word === 'EXCEPT' && tokens[index + 1]?.type === 'lparen') return null;
    if (word === 'GROUP' && isWord(tokens[index - 1], 'WITHIN')) return null;
    if (word === 'FROM' && isWord(tokens[index - 1], 'DISTINCT')) return null;
    return clause;
};

const findClosingParen = (tokens: SqlToken[], open: number, end: number) => {
    let depth = 0;
    for (let i = open; i < end; i += 1) {
        if (tokens[i].type === 'lparen') depth += 1;
        if (tokens[i].type === 'rparen') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return end;
};

const isIdentifierOrWord = (token: SqlToken | undefined) =>
    token?.type === 'word' || token?.type === 'quoted';

const readIdentifierPath = (
    tokens: SqlToken[],
    start: number,
    quoteChar: string,
): { path: string[]; next: number } => {
    const path = unquoteIdentifier(tokens[start], quoteChar);
    let i = start + 1;
    while (tokens[i]?.type === 'dot' && isIdentifierOrWord(tokens[i + 1])) {
        path.push(...unquoteIdentifier(tokens[i + 1], quoteChar));
        i += 2;
    }
    return { path, next: i };
};

const readAlias = (
    tokens: SqlToken[],
    start: number,
    quoteChar: string,
): { alias: string | null; next: number } => {
    let i = start;
    if (isWord(tokens[i], 'AS')) i += 1;
    if (isIdentifier(tokens[i])) {
        return {
            alias: unquoteIdentifier(tokens[i], quoteChar).join('.'),
            next: i + 1,
        };
    }
    return { alias: null, next: i };
};

/** Output column names of a query body: aliases or trailing identifiers. */
export const getSelectOutputColumns = (
    tokens: SqlToken[],
    quoteChar: string,
): string[] => {
    let depth = 0;
    let selectIndex = -1;
    for (let i = 0; i < tokens.length && selectIndex === -1; i += 1) {
        if (tokens[i].type === 'lparen') depth += 1;
        else if (tokens[i].type === 'rparen') depth -= 1;
        else if (depth === 0 && isWord(tokens[i], 'SELECT')) selectIndex = i;
    }
    if (selectIndex === -1) return [];

    const items: SqlToken[][] = [[]];
    depth = 0;
    for (let i = selectIndex + 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token.type === 'lparen') depth += 1;
        if (token.type === 'rparen') depth -= 1;
        if (depth === 0) {
            if (clauseAt(tokens, i)) break;
            if (token.type === 'comma') {
                items.push([]);
                continue;
            }
        }
        items[items.length - 1].push(token);
    }

    return items.flatMap((item) => {
        const last = item[item.length - 1];
        if (!isIdentifier(last)) return [];
        const segments = unquoteIdentifier(last, quoteChar);
        return [segments[segments.length - 1]];
    });
};

export const collectCtes = (
    tokens: SqlToken[],
    quoteChar: string,
): CteDefinition[] => {
    const ctes: CteDefinition[] = [];
    tokens.forEach((token, withIndex) => {
        if (!isWord(token, 'WITH')) return;
        let i = withIndex + 1;
        if (isWord(tokens[i], 'RECURSIVE')) i += 1;
        while (isIdentifier(tokens[i])) {
            const name = unquoteIdentifier(tokens[i], quoteChar).join('.');
            i += 1;
            let explicitColumns: string[] | null = null;
            if (tokens[i]?.type === 'lparen') {
                const close = findClosingParen(tokens, i, tokens.length);
                explicitColumns = tokens
                    .slice(i + 1, close)
                    .filter(isIdentifier)
                    .map((t) => unquoteIdentifier(t, quoteChar).join('.'));
                i = close + 1;
            }
            if (!isWord(tokens[i], 'AS')) break;
            i += 1;
            if (isWord(tokens[i], 'NOT')) i += 1;
            if (isWord(tokens[i], 'MATERIALIZED')) i += 1;
            if (tokens[i]?.type !== 'lparen') {
                ctes.push({ name, columns: explicitColumns ?? [] });
                break;
            }
            const close = findClosingParen(tokens, i, tokens.length);
            ctes.push({
                name,
                columns:
                    explicitColumns ??
                    getSelectOutputColumns(
                        tokens.slice(i + 1, close),
                        quoteChar,
                    ),
            });
            i = close + 1;
            if (tokens[i]?.type !== 'comma') break;
            i += 1;
        }
    });
    return ctes;
};

/** Tables referenced in FROM / JOIN at the top level of a query block. */
export const collectBlockTables = (
    tokens: SqlToken[],
    quoteChar: string,
    ctes: CteDefinition[],
): TableReference[] => {
    const tables: TableReference[] = [];
    let depth = 0;
    let inFrom = false;
    let expectingTable = false;
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (depth > 0 || (!expectingTable && token.type === 'lparen')) {
            if (token.type === 'lparen') depth += 1;
            if (token.type === 'rparen') depth -= 1;
            i += 1;
        } else if (expectingTable) {
            expectingTable = false;
            if (isWord(token, 'LATERAL')) {
                expectingTable = true;
                i += 1;
            } else if (token.type === 'lparen') {
                const close = findClosingParen(tokens, i, tokens.length);
                const { alias, next } = readAlias(tokens, close + 1, quoteChar);
                tables.push({
                    path: [],
                    alias,
                    columns: getSelectOutputColumns(
                        tokens.slice(i + 1, close),
                        quoteChar,
                    ),
                });
                i = next;
            } else if (isIdentifier(token)) {
                const { path, next } = readIdentifierPath(tokens, i, quoteChar);
                let afterPath = next;
                // Table functions such as UNNEST(...) have unknown columns
                const isFunction = tokens[next]?.type === 'lparen';
                if (isFunction) {
                    afterPath =
                        findClosingParen(tokens, next, tokens.length) + 1;
                }
                const { alias, next: afterAlias } = readAlias(
                    tokens,
                    afterPath,
                    quoteChar,
                );
                const cte =
                    path.length === 1
                        ? ctes.find(
                              (c) =>
                                  c.name.toLowerCase() ===
                                  path[0].toLowerCase(),
                          )
                        : undefined;
                tables.push({
                    path: isFunction ? [] : path,
                    alias,
                    columns: isFunction ? [] : (cte?.columns ?? null),
                });
                i = afterAlias;
            }
        } else {
            const clause = clauseAt(tokens, i);
            if (clause === 'from' || clause === 'join') {
                inFrom = true;
                expectingTable = true;
            } else if (token.type === 'comma' && inFrom) {
                expectingTable = true;
            } else if (clause) {
                inFrom = false;
            }
            i += 1;
        }
    }
    return tables;
};

const findQueryBlock = (tokens: SqlToken[], cursorIndex: number) => {
    const openParens: number[] = [];
    for (let i = 0; i < cursorIndex; i += 1) {
        if (tokens[i].type === 'lparen') openParens.push(i);
        if (tokens[i].type === 'rparen') openParens.pop();
    }
    let start = 0;
    for (let j = openParens.length - 1; j >= 0; j -= 1) {
        const paren = openParens[j];
        const first = paren + 1 < cursorIndex ? tokens[paren + 1] : undefined;
        const opensQuery = first
            ? isWord(first, 'SELECT', 'WITH')
            : isWord(tokens[paren - 1], 'FROM', 'JOIN', 'IN', 'EXISTS', 'AS');
        if (opensQuery) {
            start = paren + 1;
            break;
        }
    }
    let end = tokens.length;
    let depth = 0;
    for (let i = start; i < tokens.length; i += 1) {
        if (tokens[i].type === 'lparen') depth += 1;
        if (tokens[i].type === 'rparen') {
            if (depth === 0) {
                end = i;
                break;
            }
            depth -= 1;
        }
    }
    return { start, end };
};

const getCurrentClause = (
    tokens: SqlToken[],
    start: number,
    cursorIndex: number,
): Clause | null => {
    let clause: Clause | null = null;
    let depth = 0;
    for (let i = start; i < cursorIndex; i += 1) {
        const token = tokens[i];
        if (token.type === 'lparen') depth += 1;
        else if (token.type === 'rparen') depth -= 1;
        else if (depth === 0) {
            clause = clauseAt(tokens, i) ?? clause;
        }
    }
    return clause;
};

const endsValue = (
    previous: SqlToken,
    beforePrevious: SqlToken | undefined,
) => {
    switch (previous.type) {
        case 'word': {
            const word = upper(previous)!;
            return !RESERVED_WORDS.has(word) || VALUE_ENDING_WORDS.has(word);
        }
        case 'quoted':
        case 'string':
        case 'number':
        case 'rparen':
        case 'parameter':
            return true;
        case 'operator':
            // `SELECT *` and `t.*` are complete select items
            return (
                previous.value === '*' &&
                (beforePrevious === undefined ||
                    beforePrevious.type === 'comma' ||
                    beforePrevious.type === 'dot' ||
                    isWord(beforePrevious, 'SELECT', 'DISTINCT'))
            );
        default:
            return false;
    }
};

const getExpectation = (
    tokens: SqlToken[],
    blockStart: number,
    cursorIndex: number,
): CursorExpectation => {
    const previous =
        cursorIndex > blockStart ? tokens[cursorIndex - 1] : undefined;
    const beforePrevious =
        cursorIndex - 1 > blockStart ? tokens[cursorIndex - 2] : undefined;
    if (!previous) {
        return { kind: 'keyword', keywords: STATEMENT_START_KEYWORDS };
    }
    const clause = getCurrentClause(tokens, blockStart, cursorIndex);
    const previousWord = upper(previous);

    switch (clause) {
        case null:
            return { kind: 'keyword', keywords: STATEMENT_START_KEYWORDS };
        case 'limit':
            return { kind: 'none' };
        case 'with':
            if (previous.type === 'rparen') {
                return { kind: 'keyword', keywords: ['SELECT'] };
            }
            return isIdentifier(previous)
                ? { kind: 'keyword', keywords: ['AS'] }
                : { kind: 'none' };
        case 'setOperation':
            return {
                kind: 'keyword',
                keywords: isWord(previous, 'ALL', 'DISTINCT')
                    ? ['SELECT']
                    : ['ALL', 'DISTINCT', 'SELECT'],
            };
        case 'from':
        case 'join':
            if (
                isWord(previous, 'FROM', 'JOIN', 'LATERAL') ||
                previous.type === 'comma'
            ) {
                return { kind: 'table' };
            }
            if (previousWord && JOIN_MODIFIERS.has(previousWord)) {
                return { kind: 'keyword', keywords: ['JOIN', 'OUTER JOIN'] };
            }
            if (previousWord === 'AS' || previous.type === 'lparen') {
                return { kind: 'none' };
            }
            return { kind: 'keyword', keywords: AFTER_TABLE_KEYWORDS };
        default: {
            const valueClause: ValueClause = clause === 'using' ? 'on' : clause;
            if (
                (clause === 'groupBy' || clause === 'orderBy') &&
                isWord(previous, 'GROUP', 'ORDER')
            ) {
                return { kind: 'keyword', keywords: ['BY'] };
            }
            if (previousWord === 'AS') return { kind: 'none' };
            if (endsValue(previous, beforePrevious)) {
                return {
                    kind: 'keyword',
                    keywords: AFTER_VALUE_KEYWORDS[valueClause],
                };
            }
            const keywords = isWord(previous, 'SELECT')
                ? ['DISTINCT', ...VALUE_START_KEYWORDS]
                : VALUE_START_KEYWORDS;
            return { kind: 'value', clause: valueClause, keywords };
        }
    }
};

const isInsideToken = (token: SqlToken, offset: number) => {
    if (token.start >= offset) return false;
    if (offset < token.end) return true;
    // Line comments run to the end of the line; unclosed tokens run to the cursor
    return (
        offset === token.end &&
        (!token.closed ||
            (token.type === 'comment' && token.value.startsWith('--')))
    );
};

export const analyzeCompletionContext = (
    sql: string,
    offset: number,
    quoteChar: string,
): CompletionContext => {
    const lineStart = sql.lastIndexOf('\n', offset - 1) + 1;
    const prefix = parseQualifiedPrefix(
        sql.slice(lineStart, offset),
        quoteChar,
    );
    const allTokens = tokenizeSql(sql, quoteChar);
    const empty = (expectation: CursorExpectation): CompletionContext => ({
        expectation,
        prefix,
        tables: [],
        ctes: [],
        followsSeparator: false,
    });

    const containing = allTokens.find((t) => isInsideToken(t, offset));
    if (containing?.type === 'parameter') return empty({ kind: 'parameter' });
    if (containing?.type === 'string' || containing?.type === 'comment') {
        return empty({ kind: 'none' });
    }

    const tokens = allTokens.filter((t) => t.type !== 'comment');
    const chainStart = lineStart + prefix.chainStart;
    let cursorIndex = tokens.findIndex((t) => t.start >= chainStart);
    if (cursorIndex === -1) cursorIndex = tokens.length;

    // Restrict to the statement around the cursor
    let statementStart = 0;
    for (let i = 0; i < cursorIndex; i += 1) {
        if (tokens[i].type === 'semicolon') statementStart = i + 1;
    }
    const nextSemicolon = tokens.findIndex(
        (t, i) => i >= cursorIndex && t.type === 'semicolon',
    );
    const statement = tokens.slice(
        statementStart,
        nextSemicolon === -1 ? tokens.length : nextSemicolon,
    );
    const statementCursor = cursorIndex - statementStart;

    const block = findQueryBlock(statement, statementCursor);
    const ctes = collectCtes(statement, quoteChar);
    const previous =
        statementCursor > block.start
            ? statement[statementCursor - 1]
            : undefined;

    return {
        expectation: getExpectation(statement, block.start, statementCursor),
        prefix,
        tables: collectBlockTables(
            statement.slice(block.start, block.end),
            quoteChar,
            ctes,
        ),
        ctes,
        followsSeparator:
            previous !== undefined &&
            (previous.type === 'comma' ||
                SEPARATOR_WORDS.has(upper(previous) ?? '')),
    };
};

/** Every warehouse table referenced anywhere in the SQL, excluding CTEs. */
export const extractTableReferences = (
    sql: string,
    quoteChar: string,
): string[][] => {
    const tokens = tokenizeSql(sql, quoteChar).filter(
        (t) => t.type !== 'comment',
    );
    const ctes = collectCtes(tokens, quoteChar);
    const references: string[][] = [];
    // Each FROM / JOIN list is read in the context of its own block
    tokens.forEach((_token, index) => {
        const clause = clauseAt(tokens, index);
        if (clause !== 'from' && clause !== 'join') return;
        collectBlockTables(
            tokens.slice(index, findListEnd(tokens, index)),
            quoteChar,
            ctes,
        ).forEach((table) => {
            if (table.columns === null && table.path.length > 0) {
                references.push(table.path);
            }
        });
    });
    return references;
};

// End of the FROM / JOIN item list that starts at `start`
const findListEnd = (tokens: SqlToken[], start: number) => {
    let depth = 0;
    for (let i = start + 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token.type === 'lparen') depth += 1;
        if (token.type === 'rparen') {
            if (depth === 0) return i;
            depth -= 1;
        }
        if (token.type === 'semicolon') return i;
        const clause = clauseAt(tokens, i);
        if (depth === 0 && clause && clause !== 'from') return i;
    }
    return tokens.length;
};
