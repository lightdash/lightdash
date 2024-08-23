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
} from '@cubejs-client/core';
import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerField,
    SemanticLayerFieldType,
    SemanticLayerSortByDirection,
    SemanticLayerTransformer,
} from '@lightdash/common';
import {
    getCubeFilterFromSemanticLayerFilter,
    getCubeTimeDimensionGranularity,
    getSemanticLayerTimeGranularity,
    getSemanticLayerTypeFromCubeType,
} from './typeTransformers';

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
    semanticLayerQueryToQuery: (query) => {
        const order = query.sortBy.map((sort): TQueryOrderArray[number] => [
            sort.name,
            getCubeQueryOrder(sort.direction),
        ]);

        return {
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
            order: order.length > 0 ? order : undefined, // if order is empty array cube doesn't apply any order which could break partial results https://cube.dev/docs/product/apis-integrations/rest-api/query-format
            filters: query.filters.map(getCubeFilterFromSemanticLayerFilter),
            timezone: query.timezone,
            limit: query.limit,
        };
    },
    resultsToResultRows: (results) => results.tablePivot(),
    sqlToString: (cubeSql) => cubeSql.sql(),
};
