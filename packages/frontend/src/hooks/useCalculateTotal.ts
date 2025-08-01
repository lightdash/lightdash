import {
    getItemId,
    isField,
    isMetric,
    type ApiCalculateTotalResponse,
    type ApiError,
    type CalculateTotalFromQuery,
    type DashboardFilters,
    type ItemsMap,
    type MetricQuery,
    type MetricQueryRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import {
    convertDateDashboardFilters,
    convertDateFilters,
} from '../utils/dateFilter';

const calculateTotalFromQuery = async (
    projectUuid: string,
    metricQuery?: MetricQuery,
    explore?: string,
    parameters?: ParametersValuesMap,
): Promise<ApiCalculateTotalResponse['results']> => {
    if (!metricQuery || !explore) {
        throw new Error(
            'missing metricQuery or explore on calculateTotalFromQuery',
        );
    }

    const timezoneFixPayload: CalculateTotalFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        parameters,
    };
    return lightdashApi<ApiCalculateTotalResponse['results']>({
        url: `/projects/${projectUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const calculateTotalFromSavedChart = async (
    savedChartUuid: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
    parameters?: ParametersValuesMap,
): Promise<ApiCalculateTotalResponse['results']> => {
    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    return lightdashApi<ApiCalculateTotalResponse['results']>({
        url: `/saved/${savedChartUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify({
            dashboardFilters: timezoneFixFilters,
            invalidateCache,
            parameters,
        }),
    });
};

const postCalculateTotalForEmbed = async (
    projectUuid: string,
    savedChartUuid: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
): Promise<ApiCalculateTotalResponse['results']> => {
    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    return lightdashApi<ApiCalculateTotalResponse['results']>({
        url: `/embed/${projectUuid}/chart/${savedChartUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify({
            dashboardFilters: timezoneFixFilters,
            invalidateCache,
        }),
    });
};

const getCalculationColumnFields = (
    selectedItemIds: string[],
    itemsMap: ItemsMap,
) => {
    //This method will return the metric ids that need to be calculated in the backend

    const items = selectedItemIds
        ?.map((item) => {
            return itemsMap[item];
        })
        .filter((item) => isField(item) && isMetric(item));

    return items?.reduce<string[]>((acc, item) => {
        if (isField(item)) return [...acc, getItemId(item)];
        return acc;
    }, []);
};

export const useCalculateTotal = ({
    metricQuery,
    explore,
    savedChartUuid,
    fieldIds,
    dashboardFilters,
    invalidateCache,
    itemsMap,
    showColumnCalculation,
    embedToken,
    parameters,
}: {
    metricQuery?: MetricQueryRequest;
    explore?: string;
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    itemsMap: ItemsMap | undefined;
    fieldIds?: string[];
    showColumnCalculation?: boolean;
    embedToken: string | undefined;
    parameters?: ParametersValuesMap;
}) => {
    const metricsWithTotals = useMemo(() => {
        if (!fieldIds || !itemsMap) return [];
        if (showColumnCalculation === false) return [];
        return getCalculationColumnFields(fieldIds, itemsMap);
    }, [fieldIds, itemsMap, showColumnCalculation]);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    // only add relevant fields to the key (filters, metrics)
    const queryKey = savedChartUuid
        ? { savedChartUuid, dashboardFilters, invalidateCache, parameters }
        : {
              filters: metricQuery?.filters,
              metrics: metricQuery?.metrics,
              additionalMetrics: metricQuery?.additionalMetrics,
              parameters,
          };

    return useQuery<ApiCalculateTotalResponse['results'], ApiError>({
        queryKey: ['calculate_total', projectUuid, queryKey],
        queryFn: () =>
            embedToken && projectUuid && savedChartUuid
                ? postCalculateTotalForEmbed(
                      projectUuid,
                      savedChartUuid,
                      dashboardFilters,
                      invalidateCache,
                  )
                : savedChartUuid
                ? calculateTotalFromSavedChart(
                      savedChartUuid,
                      dashboardFilters,
                      invalidateCache,
                      parameters,
                  )
                : projectUuid
                ? calculateTotalFromQuery(
                      projectUuid,
                      metricQuery,
                      explore,
                      parameters,
                  )
                : Promise.reject(),
        retry: false,
        enabled:
            metricsWithTotals.length > 0 &&
            (metricQuery || savedChartUuid) !== undefined,
        onError: (result) =>
            console.error(
                `Unable to calculate total from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
