import { assertUnreachable, ParameterError } from '@lightdash/common';

/**
 * Leading statements that can be hoisted above a generated query. Warehouses
 * that support scripting (e.g. BigQuery) keep variables declared this way in
 * scope for the statements that follow, so they can sit above a WITH clause.
 */
const HOISTABLE_STATEMENT_PATTERN = /^(declare|set)\b/i;

const LINE_COMMENT_STARTS = ['--', '#'];

const QUOTE_CHARS = ["'", '"', '`'];

const TRIPLE_QUOTES = ["'''", '"""'];

/** The first of `tokens` that `sql` starts with at `index`, if any. */
const tokenAt = (
    sql: string,
    index: number,
    tokens: readonly string[],
): string | undefined => tokens.find((token) => sql.startsWith(token, index));

/**
 * Index just after the string/quoted identifier that starts at `start`, or the
 * end of the SQL when it is never closed.
 */
const skipQuoted = (sql: string, start: number): number => {
    const triple = tokenAt(sql, start, TRIPLE_QUOTES);
    const quote = triple ?? sql[start];
    let i = start + quote.length;
    while (i < sql.length) {
        if (sql[i] === '\\') {
            i += 2;
        } else if (sql.startsWith(quote, i)) {
            // Doubled quotes are an escaped quote, not the end of the literal
            if (!triple && sql.startsWith(quote, i + quote.length)) {
                i += quote.length * 2;
            } else {
                return i + quote.length;
            }
        } else {
            i += 1;
        }
    }
    return sql.length;
};

const skipLeadingComments = (sql: string): number => {
    let i = 0;
    while (i < sql.length) {
        if (/\s/.test(sql[i])) {
            i += 1;
        } else if (tokenAt(sql, i, LINE_COMMENT_STARTS)) {
            const newLine = sql.indexOf('\n', i);
            i = newLine === -1 ? sql.length : newLine + 1;
        } else if (sql.startsWith('/*', i)) {
            const commentEnd = sql.indexOf('*/', i + 2);
            i = commentEnd === -1 ? sql.length : commentEnd + 2;
        } else {
            return i;
        }
    }
    return i;
};

const hasSql = (statement: string): boolean =>
    skipLeadingComments(statement) < statement.length;

const isHoistableStatement = (statement: string): boolean =>
    HOISTABLE_STATEMENT_PATTERN.test(
        statement.slice(skipLeadingComments(statement)),
    );

const attachCommentOnlyStatements = (statements: string[]): string[] => {
    const grouped = statements.reduce<{
        statements: string[];
        pendingComments: string[];
    }>(
        (acc, statement) => {
            if (!hasSql(statement)) {
                return {
                    ...acc,
                    pendingComments: [...acc.pendingComments, statement],
                };
            }

            const statementWithComments =
                acc.pendingComments.length > 0
                    ? `${acc.pendingComments.join('\n')}\n${statement}`
                    : statement;
            return {
                statements: [...acc.statements, statementWithComments],
                pendingComments: [],
            };
        },
        { statements: [], pendingComments: [] },
    );

    if (grouped.pendingComments.length === 0) {
        return grouped.statements;
    }
    if (grouped.statements.length === 0) {
        return grouped.pendingComments;
    }

    return grouped.statements.map((statement, index) =>
        index === grouped.statements.length - 1
            ? `${statement}\n${grouped.pendingComments.join('\n')}`
            : statement,
    );
};

/**
 * Splits SQL into its statements at top-level semicolons, ignoring semicolons
 * inside strings, quoted identifiers and comments.
 */
export const splitSqlStatements = (sql: string): string[] => {
    const statements: string[] = [];
    let start = 0;
    let i = 0;
    const pushStatement = (end: number) => {
        const statement = sql.slice(start, end).trim();
        if (statement !== '') {
            statements.push(statement);
        }
    };
    while (i < sql.length) {
        if (tokenAt(sql, i, LINE_COMMENT_STARTS)) {
            const newLine = sql.indexOf('\n', i);
            i = newLine === -1 ? sql.length : newLine + 1;
        } else if (sql.startsWith('/*', i)) {
            const commentEnd = sql.indexOf('*/', i + 2);
            i = commentEnd === -1 ? sql.length : commentEnd + 2;
        } else if (
            tokenAt(sql, i, TRIPLE_QUOTES) ||
            QUOTE_CHARS.includes(sql[i])
        ) {
            i = skipQuoted(sql, i);
        } else if (sql[i] === ';') {
            pushStatement(i);
            i += 1;
            start = i;
        } else {
            i += 1;
        }
    }
    pushStatement(sql.length);
    return statements;
};

export type SqlScript =
    /** A single statement — nothing to hoist. */
    | { kind: 'statement'; sql: string }
    /** Leading statements that can be hoisted above a generated query. */
    | { kind: 'hoistable'; prelude: string; sql: string }
    /** A script whose leading statements cannot be hoisted. */
    | { kind: 'unhoistable' };

/**
 * Classifies SQL for generators that wrap it in a subquery or CTE. Scripts that
 * only declare variables before their final statement can be supported by
 * hoisting those declarations above the generated query.
 *
 * SQL that doesn't start with a hoistable statement is left alone, so anything
 * that works today keeps its current behaviour.
 */
export const parseSqlScript = (sql: string): SqlScript => {
    const statements = attachCommentOnlyStatements(splitSqlStatements(sql));
    const [firstStatement, ...rest] = statements;
    if (rest.length === 0 || !isHoistableStatement(firstStatement)) {
        return { kind: 'statement', sql };
    }
    const prelude = statements.slice(0, -1);
    if (!prelude.every(isHoistableStatement)) {
        return { kind: 'unhoistable' };
    }
    return {
        kind: 'hoistable',
        prelude: `${prelude.join(';\n')};`,
        sql: statements[statements.length - 1],
    };
};

export const prepareSqlForWrapping = (
    sql: string,
): { prelude: string | null; sql: string } => {
    const script = parseSqlScript(sql);
    switch (script.kind) {
        case 'statement':
            return { prelude: null, sql: script.sql };
        case 'hoistable':
            return { prelude: script.prelude, sql: script.sql };
        case 'unhoistable':
            throw new ParameterError(
                'Charts can only be generated from SQL where every statement before the final one is a DECLARE or SET statement. Remove the other statements, or view the results as a table instead.',
            );
        default:
            return assertUnreachable(script, 'Unknown SQL script kind');
    }
};
