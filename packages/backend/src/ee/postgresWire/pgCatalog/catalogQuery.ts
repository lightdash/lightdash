import {
    parse,
    type From,
    type SelectStatement,
    type Statement,
} from 'pgsql-ast-parser';
import { type PgWireQueryResult } from '../PostgresWireServer';
import { type PgWireTable } from '../types';
import { evaluateCatalogSelect, toCatalogText } from './catalogEvaluator';
import { SET_RETURNING_FUNCTIONS } from './catalogFunctions';
import { MAX_RESULT_LENGTH, tooExpensive } from './catalogLimits';
import {
    isCatalogSchema,
    resolveCatalogRelation,
    type CatalogContext,
    type CatalogRelation,
    type CatalogValue,
} from './catalogRelations';

/**
 * Entry point: decide whether a statement is a catalog query and evaluate it.
 * A SELECT belongs here when it has no FROM at all, or when every relation it
 * reads is a system catalog relation (pg_catalog, information_schema, or an
 * unqualified pg_* name that is not an explore).
 */

/**
 * Driver SQL that pgsql-ast-parser cannot parse but that we can answer once
 * reshaped. Each rewrite keeps the statement's meaning on our (empty or
 * synthetic) catalog: there are no indexes, so `_pg_expandarray(i.indkey)`
 * never produces a row; psql's explicit operator/collation spellings are the
 * plain operator.
 */
const REWRITES: [RegExp, string][] = [
    [/\(\s*information_schema\._pg_expandarray\([^()]*\)\s*\)\.n\b/gi, 'NULL'],
    [/information_schema\._pg_expandarray\([^()]*\)/gi, 'NULL'],
    // ...and the composite field access on its result
    [/\(\s*\w+\.KEYS\s*\)\.x\b/gi, 'NULL'],
    // pgjdbc trims quotes off pg_get_indexdef(), which is always null here
    [
        /\btrim\(\s*(?:both|leading|trailing)\s+'(?:[^']|'')*'\s+from\s+/gi,
        'trim(',
    ],
    [/OPERATOR\(pg_catalog\.(~\*?|!~\*?|=|<>|<|>|<=|>=|~~|!~~)\)/gi, '$1'],
    [/\bCOLLATE\s+(?:pg_catalog\.)?"?default"?/gi, ''],
];

export const rewriteCatalogSql = (sql: string): string =>
    REWRITES.reduce(
        (text, [pattern, replacement]) => text.replace(pattern, replacement),
        sql,
    );

function isCatalogFrom(
    item: From,
    relations: Map<string, CatalogRelation>,
    catalog: PgWireTable[],
): boolean {
    if (item.type === 'statement') {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- subqueries recurse
        return isCatalogSelect(item.statement, relations, catalog);
    }
    if (item.type === 'call') {
        return SET_RETURNING_FUNCTIONS.has(item.function.name.toLowerCase());
    }
    if (item.type !== 'table') {
        return false;
    }
    if (item.name.schema) {
        return isCatalogSchema(item.name.schema);
    }
    if (catalog.some((table) => table.name === item.name.name)) {
        return false;
    }
    return (
        resolveCatalogRelation(relations, undefined, item.name.name) !== null
    );
}

export function isCatalogSelect(
    statement: SelectStatement,
    relations: Map<string, CatalogRelation>,
    catalog: PgWireTable[],
): boolean {
    if (statement.type === 'union' || statement.type === 'union all') {
        return (
            isCatalogSelect(statement.left, relations, catalog) &&
            isCatalogSelect(statement.right, relations, catalog)
        );
    }
    if (statement.type === 'values') {
        return true;
    }
    if (statement.type !== 'select') {
        return false;
    }
    const from = statement.from ?? [];
    return from.every((item) => isCatalogFrom(item, relations, catalog));
}

export type CatalogQueryInput = CatalogContext & {
    /** the session's catalog relations, built once at connect */
    relations: Map<string, CatalogRelation>;
};

/** Parse the SQL as written; only driver SQL the parser rejects is rewritten */
const parseLeniently = (sql: string): Statement[] | null => {
    try {
        return parse(sql);
    } catch {
        try {
            return parse(rewriteCatalogSql(sql));
        } catch {
            return null; // the compiler produces the error message
        }
    }
};

/** Text-format rows, bounded in total size; oversized values surface as 54000 rather than a raw RangeError */
const serializeRows = (rows: CatalogValue[][]): (string | null)[][] => {
    let total = 0;
    try {
        return rows.map((row) =>
            row.map((value) => {
                const text = toCatalogText(value);
                total += text?.length ?? 0;
                if (total > MAX_RESULT_LENGTH) {
                    throw tooExpensive('returns too much data');
                }
                return text;
            }),
        );
    } catch (e) {
        if (e instanceof RangeError) {
            throw tooExpensive('returns too much data');
        }
        throw e;
    }
};

/** Route and evaluate; null when the SQL is not a catalog query */
export const tryHandleCatalogQuery = (
    sql: string,
    input: CatalogQueryInput,
): PgWireQueryResult | null => {
    const statements = parseLeniently(sql);
    if (statements === null) {
        return null;
    }
    if (statements.length !== 1) {
        return null;
    }
    const [statement] = statements;
    if (
        statement.type !== 'select' &&
        statement.type !== 'union' &&
        statement.type !== 'union all'
    ) {
        return null;
    }
    if (!isCatalogSelect(statement, input.relations, input.catalog)) {
        return null;
    }
    const result = evaluateCatalogSelect(input, statement);
    const rows = serializeRows(result.rows);
    return {
        type: 'rows',
        fields: result.columns.map((column) => ({
            name: column.name,
            oid: column.oid,
        })),
        rows,
        commandTag: `SELECT ${rows.length}`,
    };
};
