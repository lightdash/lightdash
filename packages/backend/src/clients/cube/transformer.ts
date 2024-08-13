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

const granularityMap: Record<
    SemanticLayerTimeGranularity,
    TimeDimensionGranularity | undefined
> = {
    // ! This is a partial mapping, not all supported granularities are supported by Cube
    [SemanticLayerTimeGranularity.NANOSECOND]: undefined,
    [SemanticLayerTimeGranularity.MICROSECOND]: undefined,
    [SemanticLayerTimeGranularity.MILLISECOND]: undefined,
    [SemanticLayerTimeGranularity.SECOND]: 'second',
    [SemanticLayerTimeGranularity.MINUTE]: 'minute',
    [SemanticLayerTimeGranularity.HOUR]: 'hour',
    [SemanticLayerTimeGranularity.DAY]: 'day',
    [SemanticLayerTimeGranularity.WEEK]: 'week',
    [SemanticLayerTimeGranularity.MONTH]: 'month',
    [SemanticLayerTimeGranularity.QUARTER]: 'quarter',
    [SemanticLayerTimeGranularity.YEAR]: 'year',
};

export function getCubeTimeDimensionGranularity(
    granularity?: SemanticLayerTimeGranularity,
) {
    return granularity ? granularityMap[granularity] : undefined;
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
        const semanticDimensions: SemanticLayerField[] = dimensions.map((d) => {
            const type = getSemanticLayerTypeFromCubeType(d.type);

            // TODO: check if cube has a function to get available granularities
            const availableGranularities =
                type === SemanticLayerFieldType.TIME
                    ? Object.entries(granularityMap)
                          .filter(([_, v]) => !!v)
                          .map(([k, _]) => k as SemanticLayerTimeGranularity)
                    : [];

            return {
                name: d.name,
                label: d.title,
                type,
                description: d.shortTitle,
                visible: Boolean(d.public && d.visible),
                kind: FieldKind.DIMENSION,
                availableGranularities,
            };
        });

        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: Boolean(d.public && d.visible),
            type: getSemanticLayerTypeFromCubeType(d.type),
            kind: FieldKind.METRIC,
            availableGranularities: [],
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
