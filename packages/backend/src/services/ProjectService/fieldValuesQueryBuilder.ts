import {
    FilterOperator,
    findFieldByIdInExplore,
    getFilterAutocompleteLabelDimension,
    getItemId,
    isDimension,
    isExploreError,
    isFilterRule,
    NotFoundError,
    ParameterError,
    searchFilterAutocompleteValues,
    type AndFilterGroup,
    type Dimension,
    type Explore,
    type ExploreError,
    type FilterAutocompleteValue,
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
    limit: unknown;
    maxLimit: number;
    filters: AndFilterGroup | undefined;
    exploreResolver: ExploreResolver;
}): Promise<{
    metricQuery: MetricQuery;
    explore: Explore;
    field: Dimension;
    fieldId: string;
    labelFieldId: string | null;
    /** Non-null when the field's config turns warehouse fetching off: the
     *  curated values matching the search (empty when none are configured).
     *  Callers must serve these instead of running the metric query. */
    staticResults: FilterAutocompleteValue[] | null;
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

    const initialField = findFieldByIdInExplore(explore, fieldId);

    if (!initialField) {
        throw new NotFoundError(`Can't dimension with id: ${fieldId}`);
    }

    if (!isDimension(initialField)) {
        throw new ParameterError(
            `Searching by field is only available for dimensions, but ${fieldId} is a ${initialField.type}`,
        );
    }

    const { filterAutocomplete } = initialField;
    const staticResults =
        filterAutocomplete && !filterAutocomplete.fetchFromWarehouse
            ? searchFilterAutocompleteValues(
                  filterAutocomplete.values ?? [],
                  search,
              ).slice(0, parsedLimit)
            : null;

    // Curated values answer the search on their own, so the lookup source is
    // only resolved when we would otherwise query the warehouse.
    const optionsFromDimension = staticResults
        ? undefined
        : filterAutocomplete?.optionsFromDimension;

    let field = initialField;
    if (optionsFromDimension) {
        const { model, dimension } = optionsFromDimension;
        const sourceExplore =
            (await exploreResolver.findExploreByTableName(
                projectUuid,
                model,
            )) ??
            (await exploreResolver.findJoinAliasExplore(projectUuid, model));
        if (!sourceExplore) {
            throw new NotFoundError(
                `Filter autocomplete for ${getItemId(
                    initialField,
                )} reads options from model '${model}', which has no explore (hidden models and seeds can't be used as a source)`,
            );
        }
        if (isExploreError(sourceExplore)) {
            throw new NotFoundError(
                `Filter autocomplete for ${getItemId(
                    initialField,
                )} reads options from model '${model}', whose explore has errors`,
            );
        }

        explore = sourceExplore;
        // An explore's name can differ from the table it is built on.
        fieldId = getItemId({
            table: sourceExplore.baseTable,
            name: dimension,
        });
        const sourceField = findFieldByIdInExplore(explore, fieldId);
        if (!sourceField) {
            throw new NotFoundError(
                `Filter autocomplete options source '${model}.${dimension}' does not exist`,
            );
        }
        if (!isDimension(sourceField)) {
            throw new ParameterError(
                `Filter autocomplete options source must be a dimension, but ${fieldId} is a ${sourceField.type}`,
            );
        }
        field = sourceField;
    }

    let labelFieldId: string | null = null;
    const labelDimension = staticResults
        ? undefined
        : getFilterAutocompleteLabelDimension(filterAutocomplete);
    if (labelDimension) {
        const candidateLabelFieldId = getItemId({
            table: field.table,
            name: labelDimension,
        });
        if (candidateLabelFieldId !== getItemId(field)) {
            const resolvedLabelField = findFieldByIdInExplore(
                explore,
                candidateLabelFieldId,
            );
            if (!resolvedLabelField) {
                throw new NotFoundError(
                    `Can't find label dimension '${labelDimension}' in table '${field.table}'`,
                );
            }
            if (!isDimension(resolvedLabelField)) {
                throw new ParameterError(
                    `Label field must be a dimension, but ${candidateLabelFieldId} is a ${resolvedLabelField.type}`,
                );
            }
            labelFieldId = candidateLabelFieldId;
        }
    }

    // Autocomplete ignores the field's caseSensitive setting.
    const searchFilter: FilterGroupItem = labelFieldId
        ? {
              id: uuidv4(),
              or: [
                  {
                      id: uuidv4(),
                      target: { fieldId: labelFieldId },
                      operator: FilterOperator.INCLUDE,
                      values: [search],
                      caseSensitive: false,
                  },
                  {
                      id: uuidv4(),
                      target: { fieldId },
                      operator: FilterOperator.INCLUDE,
                      values: [search],
                      caseSensitive: false,
                  },
              ],
          }
        : {
              id: uuidv4(),
              target: { fieldId },
              operator: FilterOperator.INCLUDE,
              values: [search],
              caseSensitive: false,
          };
    const sortFieldId = labelFieldId ?? getItemId(field);
    const autocompleteDimensionFilters: FilterGroupItem[] = [
        searchFilter,
        {
            id: uuidv4(),
            target: {
                fieldId,
            },
            operator: FilterOperator.NOT_NULL,
            values: [],
        },
    ];
    if (filters && !optionsFromDimension) {
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
                fieldId: sortFieldId,
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
        labelFieldId,
        staticResults,
    };
}
