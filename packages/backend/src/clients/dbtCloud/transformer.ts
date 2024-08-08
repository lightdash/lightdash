import {
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLDimension,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerTransformer,
    SemanticLayerView,
} from '@lightdash/common';

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
                type: dimension.type,
                visible: true,
                kind: FieldKind.DIMENSION,
            }),
        );

        const semanticMetrics: SemanticLayerField[] = metrics.map((metric) => ({
            name: metric.name,
            label: metric.label ?? metric.name,
            description: metric.description ?? '',
            visible: true,
            type: metric.type,
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
        return data;
    },
    sqlToString: (sql) => sql,
};
