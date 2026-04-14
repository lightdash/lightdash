import {
    FilterOperator,
    findFieldByIdInExplore,
    getItemId,
    isDimension,
    isExploreError,
    isFilterRule,
    NotFoundError,
    ParameterError,
    type AndFilterGroup,
    type Dimension,
    type Explore,
    type ExploreError,
    type FilterGroupItem,
    type MetricQuery,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

type ExploreResolver = {
    findExploreByTableName(
        projectUuid: string,
        table: string,
    ): Promise<Explore | ExploreError | undefined>;
    findJoinAliasExplore(
        projectUuid: string,
        table: string,
    ): Promise<Explore | ExploreError | undefined>;
};

export async function getFieldValuesMetricQuery({
    projectUuid,
    table,
    initialFieldId,
    search,
    limit,
    maxLimit,
    filters,
    exploreResolver,
}: {
    projectUuid: string;
    table: string;
    initialFieldId: string;
    search: string;
    limit: number;
    maxLimit: number;
    filters: AndFilterGroup | undefined;
    exploreResolver: ExploreResolver;
}): Promise<{
    metricQuery: MetricQuery;
    explore: Explore;
    field: Dimension;
    fieldId: string;
}> {
    if (!table) {
        throw new ParameterError(
            'Field value search requires a non-empty "table"',
        );
    }

    if (limit > maxLimit) {
        throw new ParameterError(`Query limit can not exceed ${maxLimit}`);
    }

    let explore = await exploreResolver.findExploreByTableName(
        projectUuid,
        table,
    );
    let fieldId = initialFieldId;
    if (!explore) {
        explore = await exploreResolver.findJoinAliasExplore(
            projectUuid,
            table,
        );
        if (explore && !isExploreError(explore)) {
            fieldId = initialFieldId.replace(table, explore.baseTable);
        }
    }

    if (!explore) {
        throw new NotFoundError(`Explore ${table} does not exist`);
    } else if (isExploreError(explore)) {
        throw new NotFoundError(`Explore ${table} has errors`);
    }

    const field = findFieldByIdInExplore(explore, fieldId);

    if (!field) {
        throw new NotFoundError(`Can't dimension with id: ${fieldId}`);
    }

    if (!isDimension(field)) {
        throw new ParameterError(
            `Searching by field is only available for dimensions, but ${fieldId} is a ${field.type}`,
        );
    }

    const autocompleteDimensionFilters: FilterGroupItem[] = [
        {
            id: uuidv4(),
            target: {
                fieldId,
            },
            operator: FilterOperator.INCLUDE,
            values: [search],
        },
        {
            id: uuidv4(),
            target: {
                fieldId,
            },
            operator: FilterOperator.NOT_NULL,
            values: [],
        },
    ];
    if (filters && Array.isArray(filters.and)) {
        const filtersCompatibleWithExplore = filters.and.filter(
            (filter) =>
                isFilterRule(filter) &&
                findFieldByIdInExplore(
                    explore as Explore,
                    filter.target.fieldId,
                ),
        );
        autocompleteDimensionFilters.push(...filtersCompatibleWithExplore);
    }

    const metricQuery: MetricQuery = {
        exploreName: explore.name,
        dimensions: [getItemId(field)],
        metrics: [],
        filters: {
            dimensions: {
                id: uuidv4(),
                and: autocompleteDimensionFilters,
            },
        },
        tableCalculations: [],
        sorts: [
            {
                fieldId: getItemId(field),
                descending: false,
            },
        ],
        limit,
    };

    return { metricQuery, explore, field, fieldId };
}
