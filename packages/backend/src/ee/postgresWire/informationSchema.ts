import {
    type Expr,
    type ExprRef,
    type SelectFromStatement,
    type Statement,
} from 'pgsql-ast-parser';
import {
    PgWireServerError,
    type PgWireQueryResult,
} from './PostgresWireServer';
import { type PgWireTable } from './types';

/**
 * Virtual information_schema.tables / information_schema.columns tables so
 * clients can discover explores and their dimensions/metrics with standard
 * catalog queries. Supports projection, simple WHERE predicates (=, !=, LIKE,
 * ILIKE, IN, AND, OR), ORDER BY and LIMIT.
 */

type VirtualValue = string | number | null;
type VirtualRow = Record<string, VirtualValue>;

const TEXT_OID = 25;
const INT8_OID = 20;

const VIRTUAL_TABLES: Record<string, string[]> = {
    tables: ['table_catalog', 'table_schema', 'table_name', 'table_type'],
    columns: [
        'table_catalog',
        'table_schema',
        'table_name',
        'column_name',
        'ordinal_position',
        'data_type',
        'is_nullable',
        'field_type',
    ],
};

/** DimensionType / MetricType value -> information_schema data_type name */
const DATA_TYPE_NAMES: Record<string, string> = {
    string: 'text',
    number: 'double precision',
    boolean: 'boolean',
    date: 'date',
    timestamp: 'timestamp without time zone',
    count: 'bigint',
    count_distinct: 'bigint',
    sum: 'double precision',
    average: 'double precision',
    median: 'double precision',
    percentile: 'double precision',
    min: 'double precision',
    max: 'double precision',
};

const buildRows = (
    virtualTable: string,
    catalog: PgWireTable[],
    projectUuid: string,
): VirtualRow[] => {
    if (virtualTable === 'tables') {
        return catalog.map((table) => ({
            table_catalog: projectUuid,
            table_schema: 'public',
            table_name: table.name,
            table_type: 'BASE TABLE',
        }));
    }
    return catalog.flatMap((table) =>
        table.fields.map((field, index) => ({
            table_catalog: projectUuid,
            table_schema: 'public',
            table_name: table.name,
            column_name: field.fieldId,
            ordinal_position: index + 1,
            data_type: DATA_TYPE_NAMES[field.type] ?? 'text',
            is_nullable: 'YES',
            field_type: field.kind,
        })),
    );
};

const literalOf = (expr: Expr): VirtualValue => {
    switch (expr.type) {
        case 'string':
            return expr.value;
        case 'integer':
        case 'numeric':
            return expr.value;
        case 'null':
            return null;
        default:
            throw new PgWireServerError(
                'information_schema filters only support literal values',
                '0A000',
            );
    }
};

const likeToRegex = (pattern: string, caseInsensitive: boolean): RegExp => {
    const escaped = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
    return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : undefined);
};

const columnValue = (
    row: VirtualRow,
    ref: ExprRef,
    availableColumns: string[],
): VirtualValue => {
    if (!availableColumns.includes(ref.name)) {
        throw new PgWireServerError(
            `Column "${ref.name}" does not exist in information_schema`,
            '42703',
            `Available columns: ${availableColumns.join(', ')}`,
        );
    }
    return row[ref.name] ?? null;
};

const evalPredicate = (
    expr: Expr,
    row: VirtualRow,
    availableColumns: string[],
): boolean => {
    switch (expr.type) {
        case 'binary': {
            const { op } = expr;
            if (op === 'AND') {
                return (
                    evalPredicate(expr.left, row, availableColumns) &&
                    evalPredicate(expr.right, row, availableColumns)
                );
            }
            if (op === 'OR') {
                return (
                    evalPredicate(expr.left, row, availableColumns) ||
                    evalPredicate(expr.right, row, availableColumns)
                );
            }
            if (expr.left.type !== 'ref') {
                throw new PgWireServerError(
                    'information_schema filters must have a column on the left side',
                    '0A000',
                );
            }
            const value = columnValue(row, expr.left, availableColumns);
            if (op === 'IN' || op === 'NOT IN') {
                const list =
                    expr.right.type === 'list'
                        ? expr.right.expressions
                        : [expr.right];
                const matches = list.some(
                    (item) => String(literalOf(item)) === String(value),
                );
                return op === 'IN' ? matches : !matches;
            }
            if (
                op === 'LIKE' ||
                op === 'ILIKE' ||
                op === 'NOT LIKE' ||
                op === 'NOT ILIKE'
            ) {
                const pattern = literalOf(expr.right);
                if (typeof pattern !== 'string') {
                    throw new PgWireServerError(
                        'LIKE patterns must be strings',
                        '22023',
                    );
                }
                const matches =
                    value !== null &&
                    likeToRegex(pattern, op.includes('ILIKE')).test(
                        String(value),
                    );
                return op.startsWith('NOT') ? !matches : matches;
            }
            if (op === '=' || op === '!=') {
                const literal = literalOf(expr.right);
                const matches = String(value) === String(literal);
                return op === '=' ? matches : !matches;
            }
            throw new PgWireServerError(
                `Operator "${op}" is not supported on information_schema`,
                '0A000',
            );
        }
        default:
            throw new PgWireServerError(
                'Unsupported filter on information_schema',
                '0A000',
                'Supported: =, !=, LIKE, ILIKE, IN, AND, OR',
            );
    }
};

/**
 * Serve SELECTs against information_schema.tables / information_schema.columns
 * from the session catalog. Returns null when the statement targets something
 * else (regular compilation should proceed).
 */
export const tryHandleInformationSchema = (
    statements: Statement[],
    catalog: PgWireTable[],
    projectUuid: string,
): PgWireQueryResult | null => {
    if (statements.length !== 1) return null;
    const [statement] = statements;
    if (statement.type !== 'select') return null;
    const select = statement as SelectFromStatement;
    if (!select.from || select.from.length !== 1) return null;
    const [from] = select.from;
    if (from.type !== 'table') return null;
    if (from.name.schema !== 'information_schema') return null;

    const virtualTable = from.name.name;
    const availableColumns = VIRTUAL_TABLES[virtualTable];
    if (!availableColumns) {
        throw new PgWireServerError(
            `information_schema.${virtualTable} is not supported`,
            '42P01',
            'Available: information_schema.tables, information_schema.columns',
        );
    }

    let rows = buildRows(virtualTable, catalog, projectUuid);

    if (select.where) {
        rows = rows.filter((row) =>
            evalPredicate(select.where as Expr, row, availableColumns),
        );
    }

    for (const orderBy of [...(select.orderBy ?? [])].reverse()) {
        if (orderBy.by.type !== 'ref') {
            throw new PgWireServerError(
                'ORDER BY on information_schema only supports column names',
                '0A000',
            );
        }
        const { name } = orderBy.by;
        const direction = orderBy.order === 'DESC' ? -1 : 1;
        rows = [...rows].sort((a, b) => {
            const left = a[name];
            const right = b[name];
            if (typeof left === 'number' && typeof right === 'number') {
                return (left - right) * direction;
            }
            return String(left).localeCompare(String(right)) * direction;
        });
    }

    if (select.limit?.limit?.type === 'integer') {
        rows = rows.slice(0, select.limit.limit.value);
    }

    // projection: * or column refs (with optional aliases)
    const projected: Array<{ name: string; column: string }> = [];
    for (const col of select.columns ?? []) {
        if (col.expr.type === 'ref' && col.expr.name === '*') {
            availableColumns.forEach((column) =>
                projected.push({ name: column, column }),
            );
        } else if (col.expr.type === 'ref') {
            const { name } = col.expr;
            if (!availableColumns.includes(name)) {
                throw new PgWireServerError(
                    `Column "${name}" does not exist in information_schema.${virtualTable}`,
                    '42703',
                    `Available columns: ${availableColumns.join(', ')}`,
                );
            }
            projected.push({ name: col.alias?.name ?? name, column: name });
        } else {
            throw new PgWireServerError(
                'Only plain columns can be selected from information_schema',
                '0A000',
            );
        }
    }

    return {
        type: 'rows',
        fields: projected.map((p) => ({
            name: p.name,
            oid: p.column === 'ordinal_position' ? INT8_OID : TEXT_OID,
        })),
        rows: rows.map((row) =>
            projected.map((p) => {
                const value = row[p.column];
                return value === null ? null : String(value);
            }),
        ),
        commandTag: `SELECT ${rows.length}`,
    };
};
