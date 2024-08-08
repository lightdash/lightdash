import {
    Cube,
    Query as CubeQuery,
    TCubeDimension,
    TCubeMeasure,
} from '@cubejs-client/core';
import {
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerTransformer,
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
                kind: FieldKind.DIMENSION,
            }),
        );
        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: d.public,
            type: d.type,
            kind: FieldKind.METRIC,
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
