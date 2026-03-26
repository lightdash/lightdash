import type {
    CompiledDimension,
    CompiledMetric,
    FieldId,
} from '../../types/field';
import { getItemId } from '../../utils/item';

export const getDimensionBaseName = (
    dimension: Pick<
        CompiledDimension,
        'name' | 'timeIntervalBaseDimensionName'
    >,
): string => dimension.timeIntervalBaseDimensionName ?? dimension.name;

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
