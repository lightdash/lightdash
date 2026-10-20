import {
    getFields,
    getItemId,
    isCompiledMetric,
    type CompiledField,
    type Explore,
    type FieldId,
    type MaterializationMetricQueryPayload,
    type PreAggregateDef,
} from '@lightdash/common';
import { createHash } from 'crypto';

// Whitespace next to these never separates tokens, so it is dropped outright
const SQL_PUNCTUATION = new Set(['(', ')', '[', ']', '{', '}', ',', '.', ';']);

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

/**
 * Collapses whitespace and drops SQL comments outside string literals and
 * quoted identifiers, so reformatting an expression leaves it untouched.
 */
export const normalizeSql = (sql: string): string => {
    let out = '';
    let quote: string | null = null;
    let pendingSpace = false;
    let i = 0;
    const flushSpace = (next: string) => {
        if (
            pendingSpace &&
            out.length > 0 &&
            !SQL_PUNCTUATION.has(next) &&
            !SQL_PUNCTUATION.has(out[out.length - 1])
        ) {
            out += ' ';
        }
        pendingSpace = false;
    };
    while (i < sql.length) {
        const char = sql[i];
        if (quote) {
            out += char;
            if (char === quote && sql[i + 1] === quote) {
                out += quote;
                i += 2;
            } else {
                if (char === quote) quote = null;
                i += 1;
            }
        } else if (char === "'" || char === '"' || char === '`') {
            flushSpace(char);
            quote = char;
            out += char;
            i += 1;
        } else if (char === '-' && sql[i + 1] === '-') {
            const end = sql.indexOf('\n', i);
            i = end === -1 ? sql.length : end;
            pendingSpace = true;
        } else if (char === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? sql.length : end + 2;
            pendingSpace = true;
        } else if (/\s/.test(char)) {
            pendingSpace = true;
            i += 1;
        } else {
            flushSpace(char);
            out += char;
            i += 1;
        }
    }
    return out;
};

const normalizeOptionalSql = (sql: string | undefined | null): string | null =>
    sql === undefined || sql === null ? null : normalizeSql(sql);

// Sorted keys so object insertion order never changes the hash. Filter rule
// ids are minted fresh on every compile and carry no meaning, so they go.
const canonicalize = (value: unknown): JsonValue => {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .filter((key) => key !== 'id')
            .sort()
            .reduce<Record<string, JsonValue>>((acc, key) => {
                const entry = (value as Record<string, unknown>)[key];
                if (entry !== undefined) acc[key] = canonicalize(entry);
                return acc;
            }, {});
    }
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    )
        return value;
    return String(value);
};

// Order-free list: the materialized file is read by column name
const canonicalSet = (values: unknown[]): JsonValue[] =>
    values
        .map((value) => JSON.stringify(canonicalize(value)))
        .sort()
        .map((json) => JSON.parse(json) as JsonValue);

const getFilterTargetFieldIds = (
    filters: MaterializationMetricQueryPayload['metricQuery']['filters'],
): FieldId[] => {
    const fieldIds: FieldId[] = [];
    const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const group = node as {
            and?: unknown[];
            or?: unknown[];
            target?: { fieldId?: string };
        };
        if (typeof group.target?.fieldId === 'string')
            fieldIds.push(group.target.fieldId);
        (group.and ?? group.or ?? []).forEach(walk);
    };
    walk(filters.dimensions);
    walk(filters.metrics);
    walk(filters.tableCalculations);
    return fieldIds;
};

const compiledFieldInput = (field: CompiledField) => ({
    fieldType: field.fieldType,
    type: field.type,
    table: field.table,
    compiledSql: normalizeSql(field.compiledSql),
    tablesReferences: [...(field.tablesReferences ?? [])].sort(),
    ...(isCompiledMetric(field)
        ? {
              compiledValueSql: normalizeOptionalSql(field.compiledValueSql),
              compiledDistinctKeys:
                  field.compiledDistinctKeys?.map(normalizeSql).sort() ?? null,
              filters: field.filters ? canonicalSet(field.filters) : null,
          }
        : {}),
});

/**
 * Hash of everything that decides the rows a materialization holds: the
 * fields the definition selects and filters on (by compiled SQL), the
 * tables and joins those fields reach, the definition filters, time
 * grain, row cap and materialization role. Labels, descriptions, formats,
 * key order, SQL formatting, sort order and refresh settings stay out.
 */
export const computeMaterializationFingerprint = ({
    sourceExplore,
    preAggregateDef,
    materializationMetricQuery,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    materializationMetricQuery: MaterializationMetricQueryPayload;
}): string => {
    const fieldsById = new Map<FieldId, CompiledField>(
        getFields(sourceExplore).map((field) => [getItemId(field), field]),
    );
    const { metricQuery, metricComponents, timeDimensionFieldId } =
        materializationMetricQuery;
    const selectedFieldIds = Array.from(
        new Set<FieldId>([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...Object.keys(metricComponents),
            ...getFilterTargetFieldIds(metricQuery.filters),
        ]),
    ).sort();

    const fields = selectedFieldIds.reduce<
        Record<FieldId, ReturnType<typeof compiledFieldInput> | null>
    >((acc, fieldId) => {
        const field = fieldsById.get(fieldId);
        acc[fieldId] = field ? compiledFieldInput(field) : null;
        return acc;
    }, {});

    const joinsByTable = new Map(
        sourceExplore.joinedTables.map((join) => [join.table, join]),
    );
    const referencedTables = new Set<string>([sourceExplore.baseTable]);
    const visit = (tableName: string) => {
        if (referencedTables.has(tableName)) return;
        referencedTables.add(tableName);
        joinsByTable
            .get(tableName)
            ?.tablesReferences?.forEach((reference) => visit(reference));
    };
    selectedFieldIds.forEach((fieldId) => {
        const field = fieldsById.get(fieldId);
        if (!field) return;
        visit(field.table);
        field.tablesReferences?.forEach((reference) => visit(reference));
    });

    const tables = Array.from(referencedTables)
        .sort()
        .reduce<Record<string, JsonValue>>((acc, tableName) => {
            const table = sourceExplore.tables[tableName];
            const join = joinsByTable.get(tableName);
            acc[tableName] = canonicalize({
                sqlTable: normalizeOptionalSql(table?.sqlTable),
                sqlWhere: normalizeOptionalSql(table?.sqlWhere),
                requiredAttributes: table?.requiredAttributes ?? null,
                join: join
                    ? {
                          compiledSqlOn: normalizeSql(join.compiledSqlOn),
                          type: join.type ?? null,
                          relationship: join.relationship ?? null,
                          always: join.always ?? null,
                      }
                    : null,
            });
            return acc;
        }, {});

    const input = canonicalize({
        version: 2,
        targetDatabase: sourceExplore.targetDatabase,
        warehouse: sourceExplore.warehouse ?? null,
        databricksCompute: sourceExplore.databricksCompute ?? null,
        baseTable: sourceExplore.baseTable,
        dimensions: [...metricQuery.dimensions].sort(),
        metrics: [...metricQuery.metrics].sort(),
        metricComponents,
        additionalMetrics: canonicalSet(
            (metricQuery.additionalMetrics ?? []).map((metric) => ({
                ...metric,
                sql: normalizeSql(metric.sql),
                filters: metric.filters ? canonicalSet(metric.filters) : null,
            })),
        ),
        filters: metricQuery.filters,
        timeDimensionFieldId,
        granularity: preAggregateDef.granularity ?? null,
        resolvedMaxRows: materializationMetricQuery.resolvedMaxRows,
        materializationRole: preAggregateDef.materializationRole ?? null,
        fields,
        tables,
    });

    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
};
