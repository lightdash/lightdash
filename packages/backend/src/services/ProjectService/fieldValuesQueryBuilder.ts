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

const parseFieldValuesLimit = (limit: unknown, maxLimit: number): number => {
    if (
        typeof limit !== 'number' ||
        !Number.isSafeInteger(limit) ||
        limit < 0
    ) {
        throw new ParameterError('Query limit must be a non-negative integer');
    }

    if (limit > maxLimit) {
        throw new ParameterError(`Query limit can not exceed ${maxLimit}`);
    }

    return limit;
};

export async function getFieldValuesMetricQuery({
    projectUuid,
    table,
    initialFieldId,
    initialLabelFieldId,
    search,
    limit,
    maxLimit,
    filters,
    exploreResolver,
}: {
    projectUuid: string;
    table: string;
    initialFieldId: string;
    initialLabelFieldId?: string;
    search: string;
    limit: unknown;
    maxLimit: number;
    filters: AndFilterGroup | undefined;
    exploreResolver: ExploreResolver;
}): Promise<{
    metricQuery: MetricQuery;
    explore: Explore;
    field: Dimension;
    fieldId: string;
    labelField: Dimension | undefined;
    labelFieldId: string | undefined;
}> {
    const parsedLimit = parseFieldValuesLimit(limit, maxLimit);

    if (!table) {
        throw new ParameterError(
            'Field value search requires a non-empty "table"',
        );
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

    let labelFieldId = initialLabelFieldId
        ? initialLabelFieldId.replace(table, explore.baseTable)
        : undefined;
    const labelField = labelFieldId
        ? findFieldByIdInExplore(explore, labelFieldId)
        : undefined;
    if (initialLabelFieldId && !labelField) {
        throw new NotFoundError(
            `Can't find label dimension '${labelFieldId}' in explore '${explore.name}'`,
        );
    }
    if (labelField && !isDimension(labelField)) {
        throw new ParameterError(
            `Label field must be a dimension, but ${labelFieldId} is a ${labelField.type}`,
        );
    }
    if (labelField) {
        labelFieldId = getItemId(labelField);
    }

    // Search/sort by label when present so the UI can match user input against
    // the displayed text rather than the underlying value.
    const searchFieldId = labelFieldId ?? fieldId;
    const autocompleteDimensionFilters: FilterGroupItem[] = [
        {
            id: uuidv4(),
            target: {
                fieldId: searchFieldId,
            },
            operator: FilterOperator.INCLUDE,
            values: [search],
            // Autocomplete ignores the field's caseSensitive setting.
            caseSensitive: false,
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
    if (filters) {
        if (!Array.isArray(filters.and)) {
            throw new ParameterError(
                'Filters must include an "and" array of filter rules',
            );
        }
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
        dimensions: labelFieldId
            ? [getItemId(field), labelFieldId]
            : [getItemId(field)],
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
                fieldId: searchFieldId,
                descending: false,
            },
        ],
        limit: parsedLimit,
    };

    return {
        metricQuery,
        explore,
        field,
        fieldId,
        labelField: labelField ?? undefined,
        labelFieldId,
    };
}
