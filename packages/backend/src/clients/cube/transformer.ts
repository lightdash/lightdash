import {
    Cube,
    Query as CubeQuery,
    ResultSet,
    SqlQuery,
    TCubeDimension,
    TCubeMeasure,
    TCubeMemberType,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerTransformer,
} from '@lightdash/common';

function getSemanticLayerTypeFromCubeType(
    cubeType: TCubeMemberType,
): SemanticLayerFieldType {
    switch (cubeType) {
        case 'string':
            return SemanticLayerFieldType.STRING;
        case 'number':
            return SemanticLayerFieldType.NUMBER;
        case 'boolean':
            return SemanticLayerFieldType.BOOLEAN;
        case 'time':
            return SemanticLayerFieldType.TIME;
        default:
            return assertUnreachable(
                cubeType,
                `Unknown cube type: ${cubeType}`,
            );
    }
}

type DimensionsWithVisibility = (TCubeDimension &
    Pick<SemanticLayerField, 'visible'>)[];
type MeasuresWithVisibility = (TCubeMeasure &
    Pick<SemanticLayerField, 'visible'>)[];

export const cubeTransfomers: SemanticLayerTransformer<
    Cube,
    CubeQuery,
    DimensionsWithVisibility | MeasuresWithVisibility,
    DimensionsWithVisibility | MeasuresWithVisibility,
    ResultSet,
    SqlQuery
> = {
    fieldsToSemanticLayerFields: (dimensions, metrics) => {
        const semanticDimensions: SemanticLayerField[] = dimensions.map(
            (d) => ({
                name: d.name,
                label: d.title,
                type: getSemanticLayerTypeFromCubeType(d.type),
                description: d.shortTitle,
                visible: d.public && d.visible,
                kind: FieldKind.DIMENSION,
            }),
        );
        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: d.public && d.visible,
            type: getSemanticLayerTypeFromCubeType(d.type),
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
        timeDimensions: query.timeDimensions.map((td) => ({
            dimension: td,
        })),
        filters: [],
        limit: 100,
    }),
    resultsToResultRows: (cubeResultSet) => cubeResultSet.tablePivot(),
    sqlToString: (cubeSql) => cubeSql.sql(),
};
