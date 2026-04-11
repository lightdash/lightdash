import type {
    CompiledDimension,
    CompiledMetric,
    FieldId,
} from '../../types/field';
import { getItemId } from '../../utils/item';

const SIMPLE_TABLE_COLUMN_SQL_PATTERN =
    /^\$\{TABLE\}\.(?:"([^"]+)"|`([^`]+)`|([a-zA-Z_][a-zA-Z0-9_$]*))$/;

export const getDimensionBaseName = (
    dimension: Pick<
        CompiledDimension,
        'name' | 'timeIntervalBaseDimensionName'
    >,
): string => dimension.timeIntervalBaseDimensionName ?? dimension.name;

export const getSimpleSqlColumnName = (
    dimension: Pick<CompiledDimension, 'sql'>,
): string | null => {
    const match = dimension.sql.match(SIMPLE_TABLE_COLUMN_SQL_PATTERN);
    return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
};

export const getDimensionReferences = ({
    dimension,
    baseTable,
}: {
    dimension: Pick<
        CompiledDimension,
        'table' | 'name' | 'timeIntervalBaseDimensionName'
    >;
    baseTable: string;
}): string[] => {
    const baseName = getDimensionBaseName(dimension);
    const tableQualifiedReference = `${dimension.table}.${baseName}`;

    if (dimension.table === baseTable) {
        return [baseName, tableQualifiedReference];
    }

    return [tableQualifiedReference];
};

export const getMetricReferences = ({
    metric,
    baseTable,
}: {
    metric: Pick<CompiledMetric, 'table' | 'name'>;
    baseTable: string;
}): string[] => {
    const references = [`${metric.table}.${metric.name}`];

    if (metric.table === baseTable) {
        references.push(metric.name);
    }

    return references;
};

export type PreAggregateMetricReferenceLookup = {
    fieldId: FieldId;
    metric: CompiledMetric;
};

export type PreAggregateDimensionReferenceLookup = {
    fieldId: FieldId;
    dimension: CompiledDimension;
};

export const getDimensionsByReference = ({
    tables,
    baseTable,
}: {
    tables: Record<string, { dimensions: Record<string, CompiledDimension> }>;
    baseTable: string;
}): Map<string, PreAggregateDimensionReferenceLookup[]> =>
    Object.values(tables).reduce<
        Map<string, PreAggregateDimensionReferenceLookup[]>
    >((acc, table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            const fieldId = getItemId(dimension);
            new Set([
                fieldId,
                ...getDimensionReferences({
                    dimension,
                    baseTable,
                }),
            ]).forEach((reference) => {
                const existingReferences = acc.get(reference) ?? [];
                acc.set(reference, [
                    ...existingReferences,
                    { fieldId, dimension },
                ]);
            });
        });
        return acc;
    }, new Map<string, PreAggregateDimensionReferenceLookup[]>());

export const getMetricsByReference = ({
    tables,
    baseTable,
}: {
    tables: Record<string, { metrics: Record<string, CompiledMetric> }>;
    baseTable: string;
}): Map<string, PreAggregateMetricReferenceLookup> =>
    Object.values(tables).reduce<
        Map<string, PreAggregateMetricReferenceLookup>
    >((acc, table) => {
        Object.values(table.metrics).forEach((metric) => {
            const fieldId = getItemId(metric);
            new Set([
                fieldId,
                ...getMetricReferences({
                    metric,
                    baseTable,
                }),
            ]).forEach((reference) => {
                acc.set(reference, { fieldId, metric });
            });
        });
        return acc;
    }, new Map<string, PreAggregateMetricReferenceLookup>());
