import {
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLDimension,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerTransformer,
} from '@lightdash/common';

export const dbtCloudTransfomers: SemanticLayerTransformer<
    unknown, // dbt doesn't have the concept of views
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
                label: dimension.label ?? '',
                description: dimension.description ?? '',
                type: dimension.type,
                visible: true,
                kind: FieldKind.DIMENSION,
            }),
        );

        const semanticMetrics: SemanticLayerField[] = metrics.map((metric) => ({
            name: metric.name,
            label: metric.label ?? '',
            description: metric.description ?? '',
            visible: true,
            type: metric.type,
            kind: FieldKind.METRIC,
        }));

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (_ = []) => [
        // return a placeholder view
        {
            label: 'DBT Semantic View',
            name: 'dbtSemanticView',
            visible: true,
        },
    ],
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
