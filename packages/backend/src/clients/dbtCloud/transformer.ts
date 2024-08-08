import {
    assertUnreachable,
    DbtDimensionType,
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLDimension,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    DbtMetricType,
    FieldType as FieldKind,
    ResultRow,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerTransformer,
    SemanticLayerView,
} from '@lightdash/common';

function getSemanticLayerTypeFromDbtType(
    dbtType: DbtDimensionType | DbtMetricType,
): SemanticLayerFieldType {
    switch (dbtType) {
        case DbtDimensionType.CATEGORICAL:
            return SemanticLayerFieldType.STRING;
        case DbtDimensionType.TIME:
            return SemanticLayerFieldType.TIME;
        case DbtMetricType.CONVERSION:
        case DbtMetricType.CUMULATIVE:
        case DbtMetricType.RATIO:
        case DbtMetricType.DERIVED:
        case DbtMetricType.SIMPLE:
            return SemanticLayerFieldType.NUMBER;
        default:
            return assertUnreachable(dbtType, `Unknown dbt type: ${dbtType}`);
    }
}

export const dbtCloudTransfomers: SemanticLayerTransformer<
    SemanticLayerView,
    DbtGraphQLCreateQueryArgs | DbtGraphQLCompileSqlArgs,
    DbtGraphQLDimension[],
    DbtGraphQLMetric[],
    DbtGraphQLJsonResult,
    string
> = {
    fieldsToSemanticLayerFields: (dimensions, metrics) => {
        const semanticDimensions: SemanticLayerField[] = dimensions.map(
            (dimension) => ({
                name: dimension.name,
                label: dimension.label ?? dimension.name,
                description: dimension.description ?? '',
                type: getSemanticLayerTypeFromDbtType(dimension.type),
                visible: true,
                kind: FieldKind.DIMENSION,
            }),
        );

        const semanticMetrics: SemanticLayerField[] = metrics.map((metric) => ({
            name: metric.name,
            label: metric.label ?? metric.name,
            description: metric.description ?? '',
            visible: true,
            type: getSemanticLayerTypeFromDbtType(metric.type),
            kind: FieldKind.METRIC,
        }));

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (views) => views, // dbt doesn't have the concept of views so we return a placeholder
    semanticLayerQueryToQuery: (query) => {
        const { metrics, dimensions } = query;
        return {
            metrics: metrics.map((metric) => ({ name: metric })),
            groupBy: dimensions.map((dimension) => ({ name: dimension })),
            where: [],
            orderBy: [],
        };
    },
    resultsToResultRows: (results) => {
        const { data } = results;
        return data.map((row): ResultRow => {
            const newRow: ResultRow = {};
            Object.entries(row).forEach(([key, value]) => {
                newRow[key] = {
                    value: {
                        formatted: value ? value.toString() : '∅', // For now formatting the value to go into the ResultRow is just stringifying it or showing '∅' if it's null
                        raw: value,
                    },
                };
            });
            return newRow;
        });
    },
    sqlToString: (sql) => sql,
};
