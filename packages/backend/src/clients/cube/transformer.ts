import {
    Cube,
    Query as CubeQuery,
    ResultSet,
    SqlQuery,
    TCubeDimension,
    TCubeMeasure,
} from '@cubejs-client/core';
import {
    FieldType,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerTransformer,
    SemanticLayerView,
} from '@lightdash/common';

export const cubeTransfomers: SemanticLayerTransformer<
    Cube,
    CubeQuery,
    TCubeDimension[] | TCubeMeasure[],
    TCubeDimension[] | TCubeMeasure[],
    any,
    any
> = {
    fieldsToSemanticLayerFields: (dimensions, metrics) => {
        const semanticDimensions: SemanticLayerField[] = dimensions.map(
            (d) => ({
                name: d.name,
                label: d.title,
                type: d.type,
                description: d.shortTitle,
                visible: d.public,
                fieldType: FieldType.DIMENSION,
            }),
        );
        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: d.public,
            type: d.type,
            fieldType: FieldType.METRIC,
        }));

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (cubeViews) =>
        cubeViews.map((view) => ({
            name: view.name,
            label: view.title,
            visible: view.public,
        })),
    semanticLayerQueryToQuery: (query) => ({
        measures: query.metrics,
        dimensions: query.dimensions,
        filters: [],
        timeDimensions: [],
        limit: 100,
    }),
    resultsToResultRows: (cubeResultSet) =>
        cubeResultSet.loadResponse.results[0]?.data || [],

    sqlToString: (cubeSql) => cubeSql.sqlQuery.sql.sql[0],
};
