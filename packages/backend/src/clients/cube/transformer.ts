import {
    Cube,
    Query as CubeQuery,
    ResultSet,
    TCubeDimension,
    TCubeMeasure,
} from '@cubejs-client/core';
import {
    FieldType,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerView,
} from '@lightdash/common';

export const cubeTransfomers = {
    cubeFieldsToSemanticLayerFields: (
        cubeDimensions: TCubeDimension[] | TCubeMeasure[],
        cubeMetrics: TCubeDimension[] | TCubeMeasure[],
    ): SemanticLayerField[] => {
        const dimensions: SemanticLayerField[] = cubeDimensions.map((d) => ({
            name: d.name,
            label: d.title,
            type: d.type,
            description: d.shortTitle,
            visible: d.public,
            fieldType: FieldType.DIMENSION,
        }));
        const metrics: SemanticLayerField[] = cubeMetrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: d.public,
            type: d.type,
            fieldType: FieldType.METRIC,
        }));

        return [...dimensions, ...metrics];
    },
    cubesToSemanticLayerViews: (cubeViews: Cube[]): SemanticLayerView[] =>
        cubeViews.map((view) => ({
            name: view.name,
            label: view.title,
            visible: view.public,
        })),
    semanticLayerQueryToCubeQuery: (query: SemanticLayerQuery): CubeQuery => ({
        measures: query.metrics,
        dimensions: query.dimensions,
        filters: [],
        timeDimensions: [],
        limit: 100,
    }),
    cubeResultSetToResultRows: (cubeResultSet: any): Record<string, any>[] =>
        cubeResultSet.loadResponse.results[0]?.data || [],
};
