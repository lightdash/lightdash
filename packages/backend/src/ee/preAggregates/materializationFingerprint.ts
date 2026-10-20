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

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

// Sorted keys so object insertion order never changes the hash
const canonicalize = (value: unknown): JsonValue => {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
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
    compiledSql: field.compiledSql,
    tablesReferences: [...(field.tablesReferences ?? [])].sort(),
    ...(isCompiledMetric(field)
        ? {
              compiledValueSql: field.compiledValueSql ?? null,
              compiledDistinctKeys: field.compiledDistinctKeys ?? null,
              filters: field.filters ?? null,
          }
        : {}),
});

/**
 * Hash of everything the materialization query reads: the YAML definition,
 * the stored metric query, the compiled SQL of the fields it selects or
 * filters on, and the source tables and joins those fields reach. Changes
 * to fields the pre-aggregate does not touch leave the fingerprint alone.
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
    const { metricQuery, metricComponents } = materializationMetricQuery;
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
                sqlTable: table?.sqlTable ?? null,
                sqlWhere: table?.sqlWhere ?? null,
                uncompiledSqlWhere: table?.uncompiledSqlWhere ?? null,
                requiredAttributes: table?.requiredAttributes ?? null,
                join: join
                    ? {
                          compiledSqlOn: join.compiledSqlOn,
                          type: join.type ?? null,
                          relationship: join.relationship ?? null,
                          always: join.always ?? null,
                      }
                    : null,
            });
            return acc;
        }, {});

    // Refresh settings decide when to build, not what; they never invalidate
    const { refresh: _refresh, ...definition } = preAggregateDef;
    const input = canonicalize({
        version: 1,
        targetDatabase: sourceExplore.targetDatabase,
        warehouse: sourceExplore.warehouse ?? null,
        databricksCompute: sourceExplore.databricksCompute ?? null,
        baseTable: sourceExplore.baseTable,
        definition,
        materializationMetricQuery,
        fields,
        tables,
    });

    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
};
