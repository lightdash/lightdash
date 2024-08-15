import {
    Cube,
    Query as CubeQuery,
    QueryOrder,
    ResultSet,
    SqlQuery,
    TCubeDimension,
    TCubeMeasure,
    TCubeMemberType,
    TimeDimensionGranularity,
    TQueryOrderArray,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerSortBy,
    SemanticLayerSortByDirection,
    SemanticLayerTimeGranularity,
    SemanticLayerTransformer,
} from '@lightdash/common';
import { Query } from '@tsoa/runtime';

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

const getSemanticLayerTimeGranularity = (
    cubeGranularity: TimeDimensionGranularity,
): SemanticLayerTimeGranularity => {
    switch (cubeGranularity) {
        case 'second':
            return SemanticLayerTimeGranularity.SECOND;
        case 'minute':
            return SemanticLayerTimeGranularity.MINUTE;
        case 'hour':
            return SemanticLayerTimeGranularity.HOUR;
        case 'day':
            return SemanticLayerTimeGranularity.DAY;
        case 'week':
            return SemanticLayerTimeGranularity.WEEK;
        case 'month':
            return SemanticLayerTimeGranularity.MONTH;
        case 'quarter':
            return SemanticLayerTimeGranularity.QUARTER;
        case 'year':
            return SemanticLayerTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                cubeGranularity,
                `Unknown cube time granularity: ${cubeGranularity}`,
            );
    }
};

export const getCubeTimeDimensionGranularity = (
    semanticGranularity: SemanticLayerTimeGranularity,
): TimeDimensionGranularity => {
    switch (semanticGranularity) {
        case SemanticLayerTimeGranularity.NANOSECOND:
        case SemanticLayerTimeGranularity.MICROSECOND:
        case SemanticLayerTimeGranularity.MILLISECOND:
            throw new Error(
                'Nano, micro and millisecond granularities are not supported by cube',
            );
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
                semanticGranularity,
                `Unknown semantic time granularity: ${semanticGranularity}`,
            );
    }
};

function getCubeQueryOrder(
    direction: SemanticLayerSortByDirection,
): QueryOrder {
    switch (direction) {
        case SemanticLayerSortByDirection.ASC:
            return 'asc';
        case SemanticLayerSortByDirection.DESC:
            return 'desc';
        default:
            return assertUnreachable(
                direction,
                `Unknown order direction: ${direction}`,
            );
    }
}

const allAvailableGranularities = [
    'second',
    'minute',
    'hour',
    'day',
    'week',
    'month',
    'quarter',
    'year',
] as const;

// The following lines ensure that all available granularities from the cube
// are covered by an exhaustiveness check
type AllAvailableGranularities = typeof allAvailableGranularities[number];
type EnsureExhaustive = Exclude<
    TimeDimensionGranularity,
    AllAvailableGranularities
> extends never
    ? true
    : false;
// DO NOT REMOVE
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ensureExhaustiveCheck: EnsureExhaustive = true;

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
                    ? allAvailableGranularities.map(
                          getSemanticLayerTimeGranularity,
                      )
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
        measures: query.metrics.map((m) => m.name),
        dimensions: [
            ...query.dimensions.map((d) => d.name),
            ...query.timeDimensions.map((td) => td.name),
        ],
        timeDimensions: query.timeDimensions.map((td) => ({
            dimension: td.name,
            granularity:
                td.granularity &&
                getCubeTimeDimensionGranularity(td.granularity),
        })),
        order: query.sortBy.map((sort): TQueryOrderArray[number] => [
            sort.name,
            getCubeQueryOrder(sort.direction),
        ]),
        filters: [],
        offset: query.offset,
        limit: query.limit || 100,
    }),
    resultsToResultRows: (cubeResultSet) => cubeResultSet.tablePivot(),
    sqlToString: (cubeSql) => cubeSql.sql(),
};
