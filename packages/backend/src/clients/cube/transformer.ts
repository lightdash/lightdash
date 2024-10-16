import {
    Cube,
    Query as CubeQuery,
    QueryOrder,
    ResultSet,
    SqlQuery,
    TCubeDimension,
    TCubeMeasure,
    TimeDimensionGranularity,
    TQueryOrderArray,
    type TimeDimension,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    FieldType as FieldKind,
    getAvailableSemanticLayerFilterOperators,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerTransformer,
    SortByDirection,
} from '@lightdash/common';
import {
    getCubeFilterFromSemanticLayerFilter,
    getCubeTimeDimensionGranularity,
    getSemanticLayerTimeGranularity,
    getSemanticLayerTypeFromCubeType,
} from './typeTransformers';

function getCubeQueryOrder(direction: SortByDirection): QueryOrder {
    switch (direction) {
        case SortByDirection.ASC:
            return 'asc';
        case SortByDirection.DESC:
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
            const availableOperators =
                getAvailableSemanticLayerFilterOperators(type);

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
                availableOperators,
            };
        });

        const semanticMetrics: SemanticLayerField[] = metrics.map((d) => {
            const type = getSemanticLayerTypeFromCubeType(d.type);
            const availableOperators =
                getAvailableSemanticLayerFilterOperators(type);

            return {
                name: d.name,
                label: d.title,
                description: d.shortTitle,
                visible: Boolean(d.public && d.visible),
                type,
                kind: FieldKind.METRIC,
                availableGranularities: [],
                availableOperators,
            };
        });

        return [...semanticDimensions, ...semanticMetrics];
    },
    viewsToSemanticLayerViews: (cubeViews) =>
        cubeViews.map((view) => ({
            name: view.name,
            label: view.title,
            visible: Boolean(view.public),
        })),
    semanticLayerQueryToQuery: (query) => {
        const order = query.sortBy.map((sort): TQueryOrderArray[number] => [
            sort.name,
            getCubeQueryOrder(sort.direction),
        ]);

        const timeDimensions = query.timeDimensions.reduce<{
            withoutGranularity: string[];
            withGranularity: TimeDimension[];
        }>(
            (acc, td) => {
                if (td.granularity) {
                    acc.withGranularity.push({
                        dimension: td.name,
                        granularity: getCubeTimeDimensionGranularity(
                            td.granularity,
                        ),
                    });
                } else {
                    acc.withoutGranularity.push(td.name);
                }

                return acc;
            },
            { withoutGranularity: [], withGranularity: [] },
        );

        return {
            measures: query.metrics.map((m) => m.name),
            dimensions: [
                ...query.dimensions.map((d) => d.name),
                ...timeDimensions.withoutGranularity, // time dimensions without granularity should go on dimensions in the cube query, otherwise they won't show up in the results
            ],
            timeDimensions: timeDimensions.withGranularity,
            order: order.length > 0 ? order : undefined, // if order is empty array cube doesn't apply any order which could break partial results https://cube.dev/docs/product/apis-integrations/rest-api/query-format
            filters: query.filters.map(getCubeFilterFromSemanticLayerFilter),
            timezone: query.timezone,
            limit: query.limit,
        };
    },
    resultsToResultRows: (results) => results.tablePivot(),
    sqlToString: (cubeSql) => cubeSql.sql(),
    mapResultsKeys: (key, query) => {
        // TODO: since we currently only support one granularity per time dimension, we can just return the time dimension name as the key
        const timeDimension = query.timeDimensions.find((td) =>
            key.toLowerCase().includes(td.name.toLowerCase()),
        );

        if (timeDimension) {
            return timeDimension.name.toLowerCase();
        }

        return key.toLowerCase();
    },
    errorToReadableError: (errorMessage) => errorMessage,
};
