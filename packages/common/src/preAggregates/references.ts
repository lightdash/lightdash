import { type CompiledDimension, type CompiledMetric } from '../types/field';

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
