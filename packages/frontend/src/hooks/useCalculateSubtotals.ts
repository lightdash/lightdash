import {
    type ApiCalculateSubtotalsResponse,
    type ApiError,
    type CalculateSubtotalsFromQuery,
    type DashboardFilters,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
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
        }),
    });
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
    parameters,
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
    parameters?: ParametersValuesMap;
}) => {
    const projectUuid = useProjectUuid();

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
                  )
                : projectUuid && metricQuery && explore && columnOrder
                ? calculateSubtotalsFromQuery(
                      projectUuid,
                      explore,
                      metricQuery,
                      columnOrder,
                      pivotDimensions,
                      parameters,
                  )
                : Promise.reject(),
        {
            retry: false,
            enabled:
                showSubtotals &&
                Boolean(columnOrder) &&
                (Boolean(embedToken && savedChartUuid) ||
                    Boolean(
                        metricQuery &&
                            explore &&
                            (metricQuery.metrics.length ?? 0) > 0,
                    )),
            onError: (result: ApiError) =>
                console.error(
                    `Unable to calculate subtotals from query: ${
                        result?.error?.message || result
                    }`,
                ),
        },
    );
};
