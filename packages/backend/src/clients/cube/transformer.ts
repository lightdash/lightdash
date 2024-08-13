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
    TimeDimensionGranularity,
    SemanticLayerTimeGranularity
> = {
    second: SemanticLayerTimeGranularity.SECOND,
    minute: SemanticLayerTimeGranularity.MINUTE,
    hour: SemanticLayerTimeGranularity.HOUR,
    day: SemanticLayerTimeGranularity.DAY,
    week: SemanticLayerTimeGranularity.WEEK,
    month: SemanticLayerTimeGranularity.MONTH,
    quarter: SemanticLayerTimeGranularity.QUARTER,
    year: SemanticLayerTimeGranularity.YEAR,
};

// TODO: should we just have a reverse map here to avoid the need for looping?
export function getCubeTimeDimensionGranularity(
    granularity?: SemanticLayerTimeGranularity,
) {
    return Object.entries(granularityMap).find(
        ([_, value]) => value === granularity,
    )?.[0] as TimeDimensionGranularity | undefined;
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
                    ? Object.values(granularityMap)
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
