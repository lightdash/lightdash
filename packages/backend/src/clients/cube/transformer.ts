import {
    Cube,
    Query as CubeQuery,
    ResultSet,
    SqlQuery,
    TCubeDimension,
    TCubeMeasure,
    TCubeMemberType,
    TimeDimensionGranularity,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerTimeGranularity,
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

export function getCubeTimeDimensionGranularity(
    granularity: SemanticLayerTimeGranularity,
): TimeDimensionGranularity {
    switch (granularity) {
        case SemanticLayerTimeGranularity.NANOSECOND:
        case SemanticLayerTimeGranularity.MICROSECOND:
        case SemanticLayerTimeGranularity.MILLISECOND:
            throw new Error('Granularity not supported by cube');
        case SemanticLayerTimeGranularity.SECOND:
            return 'second';
        case SemanticLayerTimeGranularity.MINUTE:
            return 'minute';
        case SemanticLayerTimeGranularity.HOUR:
            return 'hour';
        case SemanticLayerTimeGranularity.DAY:
            return 'day';
        case SemanticLayerTimeGranularity.WEEK:
            return 'week';
        case SemanticLayerTimeGranularity.MONTH:
            return 'month';
        case SemanticLayerTimeGranularity.QUARTER:
            return 'quarter';
        case SemanticLayerTimeGranularity.YEAR:
            return 'year';
        default:
            return assertUnreachable(
                granularity,
                `Unknown time granularity: ${granularity}`,
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
                visible: Boolean(d.public && d.visible),
                kind: FieldKind.DIMENSION,
            }),
        );
        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: Boolean(d.public && d.visible),
            type: getSemanticLayerTypeFromCubeType(d.type),
            kind: FieldKind.METRIC,
        }));

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (cubeViews) =>
        cubeViews.map((view) => ({
            name: view.name,
            label: view.title,
            visible: Boolean(view.public),
        })),
    semanticLayerQueryToQuery: (query) => ({
        measures: query.metrics,
        dimensions: [
            ...query.dimensions,
            ...query.timeDimensions.map((td) => td.name),
        ],
        timeDimensions: query.timeDimensions.map((td) => ({
            dimension: td.name,
            granularity: getCubeTimeDimensionGranularity(td.granularity),
        })),
        filters: [],
        offset: query.offset,
        limit: query.limit || 100,
    }),
    resultsToResultRows: (cubeResultSet) => cubeResultSet.tablePivot(),
    sqlToString: (cubeSql) => cubeSql.sql(),
};
