import {
    getSubtotalKey,
    isField,
    type ApiCalculateSubtotalsResponse,
    type ApiError,
    type CalculateSubtotalsFromQuery,
    type DashboardFilters,
    type DateZoom,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { createMetricFlowQuery, QueryStatus } from '../api/MetricFlowAPI';
import { convertMetricQueryToMetricFlowQuery } from '../features/metricFlow/utils/convertMetricQueryToMetricFlowQuery';
import { isMetricFlowExploreName } from '../features/metricFlow/utils/metricFlowExplore';
import { pollMetricFlowQueryResults } from '../features/metricFlow/utils/pollMetricFlowQueryResults';
import {
    convertDateDashboardFilters,
    convertDateFilters,
} from '../utils/dateFilter';
import { useProjectUuid } from './useProjectUuid';

const calculateSubtotalsFromQuery = async (
    projectUuid: string,
    explore: string,
    metricQuery: MetricQuery,
    columnOrder: string[],
    pivotDimensions?: string[],
    parameters?: ParametersValuesMap,
    dateZoom?: DateZoom,
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    const timezoneFixPayload: CalculateSubtotalsFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        columnOrder,
        pivotDimensions,
        parameters,
        dateZoom,
    };
    return lightdashApi<ApiCalculateSubtotalsResponse['results']>({
        url: `/projects/${projectUuid}/calculate-subtotals`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const postCalculateSubtotalsForEmbed = async (
    embedToken: string,
    projectUuid: string,
    savedChartUuid: string,
    columnOrder: string[],
    pivotDimensions?: string[],
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
    dateZoom?: DateZoom,
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    return lightdashApi<ApiCalculateSubtotalsResponse['results']>({
        url: `/embed/${projectUuid}/chart/${savedChartUuid}/calculate-subtotals`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: JSON.stringify({
            dashboardFilters: timezoneFixFilters,
            columnOrder,
            pivotDimensions,
            invalidateCache,
            dateZoom,
        }),
    });
};

const buildSubtotalDimensionGroups = (
    metricQuery: MetricQuery,
    columnOrder: string[],
    pivotDimensions?: string[],
) => {
    const orderedDimensions = [...metricQuery.dimensions].sort((a, b) => {
        const aIndex = columnOrder.indexOf(a);
        const bIndex = columnOrder.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    const orderedDimensionsWithoutPivot = orderedDimensions.filter(
        (dimension) => !pivotDimensions?.includes(dimension),
    );
    const dimensionsToSubtotal = orderedDimensionsWithoutPivot.slice(0, -1);

    return dimensionsToSubtotal.map((_, index) =>
        dimensionsToSubtotal.slice(0, index + 1),
    );
};

const calculateMetricFlowSubtotals = async ({
    projectUuid,
    metricQuery,
    columnOrder,
    pivotDimensions,
    itemsMap,
}: {
    projectUuid: string;
    metricQuery: MetricQuery;
    columnOrder: string[];
    pivotDimensions?: string[];
    itemsMap: ItemsMap;
}): Promise<ApiCalculateSubtotalsResponse['results']> => {
    const dimensionGroupsToSubtotal = buildSubtotalDimensionGroups(
        metricQuery,
        columnOrder,
        pivotDimensions,
    );
    const subtotalsEntries = await Promise.all(
        dimensionGroupsToSubtotal.map(async (subtotalDimensions) => {
            let subtotals: Record<string, unknown>[] = [];

            try {
                const dimensions = Array.from(
                    new Set([
                        ...subtotalDimensions,
                        ...(pivotDimensions || []),
                    ]),
                );
                const subtotalMetricQuery: MetricQuery = {
                    ...metricQuery,
                    dimensions,
                    sorts: [],
                };
                const metricFlowQuery = convertMetricQueryToMetricFlowQuery(
                    subtotalMetricQuery,
                    itemsMap,
                );

                const { createQuery } = await createMetricFlowQuery(
                    projectUuid,
                    metricFlowQuery,
                );
                const results = await pollMetricFlowQueryResults(
                    projectUuid,
                    createQuery.queryId,
                );

                if (results.query.status === QueryStatus.FAILED) {
                    throw new Error(
                        results.query.error || 'MetricFlow query failed',
                    );
                }

                const allowedFieldIds = new Set<string>([
                    ...subtotalMetricQuery.metrics,
                    ...subtotalMetricQuery.dimensions,
                ]);
                const fieldIdByName = Object.entries(itemsMap).reduce<
                    Record<string, string>
                >((acc, [fieldId, item]) => {
                    if (!allowedFieldIds.has(fieldId) || !isField(item)) {
                        return acc;
                    }
                    acc[item.name.toLowerCase()] = fieldId;
                    return acc;
                }, {});
                const rawRows =
                    results.query.jsonResult?.data.map((row) =>
                        Object.entries(row).reduce<Record<string, unknown>>(
                            (acc, [columnName, value]) => {
                                const fieldId =
                                    fieldIdByName[columnName.toLowerCase()];
                                if (!fieldId) return acc;
                                acc[fieldId] = value;
                                return acc;
                            },
                            {},
                        ),
                    ) ?? [];

                subtotals = rawRows;
            } catch {
                console.error(
                    `Error running metricflow subtotal query for dimensions ${subtotalDimensions.join(
                        ',',
                    )}`,
                );
            }

            return [getSubtotalKey(subtotalDimensions), subtotals] satisfies [
                string,
                Record<string, unknown>[],
            ];
        }),
    );

    return Object.fromEntries(subtotalsEntries);
};

export const useCalculateSubtotals = ({
    metricQuery,
    explore,
    showSubtotals,
    columnOrder,
    pivotDimensions,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    embedToken,
    itemsMap,
    parameters,
    dateZoom,
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    showSubtotals?: boolean;
    columnOrder?: string[];
    pivotDimensions?: string[];
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    embedToken?: string;
    itemsMap?: ItemsMap;
    parameters?: ParametersValuesMap;
    dateZoom?: DateZoom;
}) => {
    const projectUuid = useProjectUuid();
    const isMetricFlowExplore = !!explore && isMetricFlowExploreName(explore);
    const hasMetricQuery = Boolean(
        metricQuery &&
            explore &&
            (metricQuery.metrics.length ?? 0) > 0 &&
            columnOrder,
    );

    return useQuery<ApiCalculateSubtotalsResponse['results'], ApiError>(
        [
            'calculate_subtotals',
            projectUuid,
            savedChartUuid || metricQuery,
            explore,
            columnOrder,
            showSubtotals,
            pivotDimensions,
            dashboardFilters,
            invalidateCache,
            embedToken,
            parameters,
            dateZoom,
        ],
        () =>
            embedToken && projectUuid && savedChartUuid && columnOrder
                ? postCalculateSubtotalsForEmbed(
                      embedToken,
                      projectUuid,
                      savedChartUuid,
                      columnOrder,
                      pivotDimensions,
                      dashboardFilters,
                      invalidateCache,
                      dateZoom,
                  )
                : isMetricFlowExplore &&
                    projectUuid &&
                    metricQuery &&
                    columnOrder &&
                    itemsMap
                  ? calculateMetricFlowSubtotals({
                        projectUuid,
                        metricQuery,
                        columnOrder,
                        pivotDimensions,
                        itemsMap,
                    })
                  : projectUuid && metricQuery && explore && columnOrder
                    ? calculateSubtotalsFromQuery(
                          projectUuid,
                          explore,
                          metricQuery,
                          columnOrder,
                          pivotDimensions,
                          parameters,
                          dateZoom,
                      )
                    : Promise.reject(),
        {
            retry: false,
            enabled:
                showSubtotals &&
                Boolean(columnOrder) &&
                (!isMetricFlowExplore || Boolean(itemsMap)) &&
                (Boolean(embedToken && savedChartUuid) || hasMetricQuery),
            onError: (result: ApiError) =>
                console.error(
                    `Unable to calculate subtotals from query: ${
                        result?.error?.message || result
                    }`,
                ),
        },
    );
};
