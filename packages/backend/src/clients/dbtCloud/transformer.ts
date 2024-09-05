import {
    assertUnreachable,
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLDimension,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    FieldType as FieldKind,
    getAvailableSemanticLayerFilterOperators,
    SemanticLayerField,
    SemanticLayerSortByDirection,
    SemanticLayerTransformer,
    SemanticLayerView,
} from '@lightdash/common';
import {
    getDbtFilterFromSemanticLayerFilter,
    getDbtTimeGranularity,
    getSemanticLayerTimeGranularity,
    getSemanticLayerTypeFromDbtType,
} from './typeTransformers';

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
            (dimension) => {
                const type = getSemanticLayerTypeFromDbtType(dimension.type);
                const availableOperators =
                    getAvailableSemanticLayerFilterOperators(type);

                return {
                    name: dimension.name,
                    label: dimension.label ?? dimension.name,
                    description: dimension.description ?? '',
                    type,
                    visible: dimension.visible,
                    kind: FieldKind.DIMENSION,
                    availableGranularities:
                        dimension.queryableGranularities.map(
                            getSemanticLayerTimeGranularity,
                        ),
                    availableOperators,
                };
            },
        );

        const semanticMetrics: SemanticLayerField[] = metrics.map((metric) => {
            const type = getSemanticLayerTypeFromDbtType(metric.type);
            const availableOperators =
                getAvailableSemanticLayerFilterOperators(type);

            return {
                name: metric.name,
                label: metric.label ?? metric.name,
                description: metric.description ?? '',
                visible: metric.visible,
                type,
                kind: FieldKind.METRIC,
                availableGranularities: [],
                availableOperators,
            };
        });

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (views) => views, // dbt doesn't have the concept of views so we return a placeholder
    semanticLayerQueryToQuery: (query) => {
        const { metrics, dimensions, timeDimensions } = query;
        return {
            metrics,
            groupBy: [
                ...dimensions,
                ...timeDimensions.map((td) => ({
                    name: td.name,
                    grain:
                        td.granularity && getDbtTimeGranularity(td.granularity),
                })),
            ],
            where: query.filters.map(getDbtFilterFromSemanticLayerFilter),
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
            limit: query.limit,
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
    queryToColumnMappings: (query) => {
        const dimensions = query.dimensions.map((d) => ({
            fieldName: d.name,
            columnName: d.name,
        }));

        const timeDimensions = query.timeDimensions.map((td) => ({
            fieldName: td.name,
            columnName: td.granularity
                ? `${td.name}__${getDbtTimeGranularity(td.granularity)}`
                : td.name,
        }));

        const metrics = query.metrics.map((m) => ({
            fieldName: m.name,
            columnName: m.name,
        }));

        return [...dimensions, ...timeDimensions, ...metrics];
    },
};
