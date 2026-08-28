import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FilterOperator,
    getItemMap,
    GroupValueMatchType,
    isCustomBinDimension,
    isDimension,
    isMetric,
    ParameterError,
    type CustomDimension,
    type CustomGroupBinDimension,
    type Explore,
    type GroupLimit,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';

export const stripGroupLimitMarkers = (
    customDimensions: CustomDimension[] | undefined,
): CustomDimension[] | undefined =>
    customDimensions?.map((dimension) => {
        if (
            !isCustomBinDimension(dimension) ||
            dimension.binType !== BinType.CUSTOM_GROUP
        ) {
            return dimension;
        }
        const { isGroupLimit: _isGroupLimit, ...safeDimension } = dimension;
        return safeDimension;
    });

export const validateGroupLimit = ({
    groupLimit,
    metricQuery,
    explore,
    pivotConfiguration,
    maxColumnLimit,
}: {
    groupLimit: GroupLimit;
    metricQuery: MetricQuery;
    explore: Explore;
    pivotConfiguration?: PivotConfiguration;
    maxColumnLimit: number;
}) => {
    if (
        !Number.isInteger(groupLimit.limit) ||
        groupLimit.limit < 1 ||
        groupLimit.limit > 50
    ) {
        throw new ParameterError(
            'Group limit must be an integer between 1 and 50',
        );
    }
    if (!metricQuery.dimensions.includes(groupLimit.dimensionId)) {
        throw new ParameterError(
            'Group limit dimension must be selected in the query',
        );
    }
    if (!metricQuery.metrics.includes(groupLimit.rankByMetricId)) {
        throw new ParameterError(
            'Group limit ranking metric must be selected in the query',
        );
    }

    const baseItemsMap = getItemMap(explore);
    const dimension = baseItemsMap[groupLimit.dimensionId];
    if (!isDimension(dimension) || dimension.type !== DimensionType.STRING) {
        throw new ParameterError(
            'Group limiting only supports base string dimensions',
        );
    }

    const metricItemsMap = getItemMap(explore, metricQuery.additionalMetrics);
    if (!isMetric(metricItemsMap[groupLimit.rankByMetricId])) {
        throw new ParameterError('Group limit ranking metric does not exist');
    }

    if (pivotConfiguration) {
        const valueColumnCount = pivotConfiguration.metricsAsRows
            ? 1
            : pivotConfiguration.valuesColumns.length || 1;
        if ((groupLimit.limit + 1) * valueColumnCount > maxColumnLimit) {
            throw new ParameterError(
                'Group limit exceeds the pivot table column capacity',
            );
        }
    }

    return dimension;
};

export const buildGroupLimitRankingQuery = ({
    metricQuery,
    groupLimit,
}: {
    metricQuery: MetricQuery;
    groupLimit: GroupLimit;
}): MetricQuery => ({
    ...metricQuery,
    dimensions: [groupLimit.dimensionId],
    metrics: [groupLimit.rankByMetricId],
    filters: {
        ...metricQuery.filters,
        dimensions: {
            id: 'group-limit-dimension-filters',
            and: [
                ...(metricQuery.filters.dimensions
                    ? [metricQuery.filters.dimensions]
                    : []),
                {
                    id: 'group-limit-not-null',
                    target: { fieldId: groupLimit.dimensionId },
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                },
            ],
        },
    },
    sorts: [
        { fieldId: groupLimit.rankByMetricId, descending: true },
        { fieldId: groupLimit.dimensionId, descending: false },
    ],
    limit: groupLimit.limit,
});

const getUniqueDimensionId = (
    dimensionId: string,
    metricQuery: MetricQuery,
    explore: Explore,
): string => {
    const usedIds = new Set([
        ...Object.keys(getItemMap(explore)),
        ...(metricQuery.customDimensions ?? []).map(({ id }) => id),
    ]);
    const baseId = `${dimensionId}_group_limit`;
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
        candidate = `${baseId}_${suffix}`;
        suffix += 1;
    }
    return candidate;
};

export const getGroupLimitOtherLabel = (topValues: string[]): string => {
    const values = new Set(topValues);
    if (!values.has('Other')) return 'Other';
    if (!values.has('Other (grouped)')) return 'Other (grouped)';
    let suffix = 2;
    while (values.has(`Other (grouped) ${suffix}`)) suffix += 1;
    return `Other (grouped) ${suffix}`;
};

const replaceReference = <T extends { reference: string }>(
    columns: T[] | undefined,
    sourceId: string,
    targetId: string,
): T[] | undefined =>
    columns?.map((column) =>
        column.reference === sourceId
            ? { ...column, reference: targetId }
            : column,
    );

const replaceIndexColumn = (
    indexColumn: PivotConfiguration['indexColumn'],
    sourceId: string,
    targetId: string,
): PivotConfiguration['indexColumn'] => {
    if (Array.isArray(indexColumn)) {
        return replaceReference(indexColumn, sourceId, targetId);
    }
    if (indexColumn?.reference === sourceId) {
        return { ...indexColumn, reference: targetId };
    }
    return indexColumn;
};

export const applyGroupLimit = ({
    metricQuery,
    pivotConfiguration,
    explore,
    dimension,
    groupLimit,
    topValues,
}: {
    metricQuery: MetricQuery;
    pivotConfiguration?: PivotConfiguration;
    explore: Explore;
    dimension: ReturnType<typeof validateGroupLimit>;
    groupLimit: GroupLimit;
    topValues: string[];
}): {
    metricQuery: MetricQuery;
    pivotConfiguration?: PivotConfiguration;
} => {
    const customDimensionId = getUniqueDimensionId(
        groupLimit.dimensionId,
        metricQuery,
        explore,
    );
    const customDimension: CustomGroupBinDimension = {
        id: customDimensionId,
        name: dimension.label,
        table: dimension.table,
        type: CustomDimensionType.BIN,
        binType: BinType.CUSTOM_GROUP,
        dimensionId: groupLimit.dimensionId,
        customGroups: topValues.map((value) => ({
            name: value,
            values: [{ matchType: GroupValueMatchType.EXACT, value }],
        })),
        otherLabel: getGroupLimitOtherLabel(topValues),
        isGroupLimit: true,
    };

    return {
        metricQuery: {
            ...metricQuery,
            dimensions: metricQuery.dimensions.map((id) =>
                id === groupLimit.dimensionId ? customDimensionId : id,
            ),
            customDimensions: [
                ...(metricQuery.customDimensions ?? []),
                customDimension,
            ],
            sorts: [
                ...metricQuery.sorts.filter(
                    ({ fieldId }) => fieldId !== groupLimit.dimensionId,
                ),
                { fieldId: customDimensionId, descending: false },
            ],
        },
        pivotConfiguration: pivotConfiguration
            ? {
                  ...pivotConfiguration,
                  indexColumn: replaceIndexColumn(
                      pivotConfiguration.indexColumn,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
                  groupByColumns: replaceReference(
                      pivotConfiguration.groupByColumns,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
                  sortOnlyDimensions: replaceReference(
                      pivotConfiguration.sortOnlyDimensions,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
                  passthroughDimensions: replaceReference(
                      pivotConfiguration.passthroughDimensions,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
                  pivotColumnsOrder: replaceReference(
                      pivotConfiguration.pivotColumnsOrder,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
                  sortBy: replaceReference(
                      pivotConfiguration.sortBy,
                      groupLimit.dimensionId,
                      customDimensionId,
                  ),
              }
            : undefined,
    };
};
