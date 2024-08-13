import {
    assertUnreachable,
    DbtDimensionType,
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLDimension,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    DbtMetricType,
    DbtTimeGranularity,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerTimeGranularity,
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

const granularityMap: Record<DbtTimeGranularity, SemanticLayerTimeGranularity> =
    {
        [DbtTimeGranularity.NANOSECOND]:
            SemanticLayerTimeGranularity.NANOSECOND,
        [DbtTimeGranularity.MICROSECOND]:
            SemanticLayerTimeGranularity.MICROSECOND,
        [DbtTimeGranularity.MILLISECOND]:
            SemanticLayerTimeGranularity.MILLISECOND,
        [DbtTimeGranularity.SECOND]: SemanticLayerTimeGranularity.SECOND,
        [DbtTimeGranularity.MINUTE]: SemanticLayerTimeGranularity.MINUTE,
        [DbtTimeGranularity.HOUR]: SemanticLayerTimeGranularity.HOUR,
        [DbtTimeGranularity.DAY]: SemanticLayerTimeGranularity.DAY,
        [DbtTimeGranularity.WEEK]: SemanticLayerTimeGranularity.WEEK,
        [DbtTimeGranularity.MONTH]: SemanticLayerTimeGranularity.MONTH,
        [DbtTimeGranularity.QUARTER]: SemanticLayerTimeGranularity.QUARTER,
        [DbtTimeGranularity.YEAR]: SemanticLayerTimeGranularity.YEAR,
    };

export const dbtCloudTransfomers: SemanticLayerTransformer<
    SemanticLayerView,
    DbtGraphQLCreateQueryArgs | DbtGraphQLCompileSqlArgs,
    (DbtGraphQLDimension & Pick<SemanticLayerField, 'visible'>)[],
    (DbtGraphQLMetric & Pick<SemanticLayerField, 'visible'>)[],
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
                visible: dimension.visible,
                kind: FieldKind.DIMENSION,
                availableGranularities: dimension.queryableGranularities.map(
                    (g) => granularityMap[g],
                ),
            }),
        );

        const semanticMetrics: SemanticLayerField[] = metrics.map((metric) => ({
            name: metric.name,
            label: metric.label ?? metric.name,
            description: metric.description ?? '',
            visible: metric.visible,
            type: getSemanticLayerTypeFromDbtType(metric.type),
            kind: FieldKind.METRIC,
            availableGranularities: [],
        }));

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (views) => views, // dbt doesn't have the concept of views so we return a placeholder
    semanticLayerQueryToQuery: (query) => {
        const { metrics, dimensions, timeDimensions } = query;
        return {
            metrics: metrics.map((metric) => ({ name: metric })),
            groupBy: [
                ...dimensions.map((dimension) => ({ name: dimension })),
                ...timeDimensions,
            ],
            where: [],
            orderBy: [],
            limit: 100, // Let this be 100 for now
        };
    },
    resultsToResultRows: (results) => {
        const { data } = results;
        return data.map((row) => {
            const { index, ...rowValues } = row;
            return rowValues;
        });
    },
    sqlToString: (sql) => sql,
};
