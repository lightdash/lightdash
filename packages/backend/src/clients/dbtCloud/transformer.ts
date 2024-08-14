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
    SemanticLayerSortByDirection,
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

const getSemanticLayerTimeGranularityFromDbtTimeGranularity = (
    granularity: DbtTimeGranularity,
): SemanticLayerTimeGranularity => {
    switch (granularity) {
        case DbtTimeGranularity.NANOSECOND:
            return SemanticLayerTimeGranularity.NANOSECOND;
        case DbtTimeGranularity.MICROSECOND:
            return SemanticLayerTimeGranularity.MICROSECOND;
        case DbtTimeGranularity.MILLISECOND:
            return SemanticLayerTimeGranularity.MILLISECOND;
        case DbtTimeGranularity.SECOND:
            return SemanticLayerTimeGranularity.SECOND;
        case DbtTimeGranularity.MINUTE:
            return SemanticLayerTimeGranularity.MINUTE;
        case DbtTimeGranularity.HOUR:
            return SemanticLayerTimeGranularity.HOUR;
        case DbtTimeGranularity.DAY:
            return SemanticLayerTimeGranularity.DAY;
        case DbtTimeGranularity.WEEK:
            return SemanticLayerTimeGranularity.WEEK;
        case DbtTimeGranularity.MONTH:
            return SemanticLayerTimeGranularity.MONTH;
        case DbtTimeGranularity.QUARTER:
            return SemanticLayerTimeGranularity.QUARTER;
        case DbtTimeGranularity.YEAR:
            return SemanticLayerTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                granularity,
                `Unknown dbt time granularity: ${granularity}`,
            );
    }
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
                    getSemanticLayerTimeGranularityFromDbtTimeGranularity,
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
            metrics,
            groupBy: [...dimensions, ...timeDimensions],
            where: [],
            orderBy: query.sortBy.map((sort) => {
                const { name, kind, direction } = sort;
                const descending =
                    direction === SemanticLayerSortByDirection.DESC;

                switch (kind) {
                    case FieldKind.DIMENSION:
                        return {
                            descending,
                            groupBy: {
                                name,
                            },
                        };
                    case FieldKind.METRIC:
                        return {
                            descending,
                            metric: {
                                name,
                            },
                        };
                    default:
                        return assertUnreachable(
                            kind,
                            `Unknown field kind: ${kind}`,
                        );
                }
            }),
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
