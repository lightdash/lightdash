import {
    type ApiCalculateSubtotalsResponse,
    type ApiError,
    type CalculateSubtotalsFromQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const calculateSubtotalsFromQuery = async (
    projectUuid: string,
    metricQuery?: MetricQuery,
    explore?: string,
    groupedDimensions?: string[],
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    if (!metricQuery || !explore || !groupedDimensions) {
        throw new Error(
            'missing metricQuery, explore, or groupedDimensions on calculateSubtotalsFromQuery',
        );
    }

    const timezoneFixPayload: CalculateSubtotalsFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        groupedDimensions,
    };
    return lightdashApi<ApiCalculateSubtotalsResponse['results']>({
        url: `/projects/${projectUuid}/calculate-subtotals`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

export const useCalculateSubtotals = ({
    metricQuery,
    explore,
    showSubtotals,
    groupedDimensions,
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    showSubtotals?: boolean;
    groupedDimensions?: string[];
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    // only add relevant fields to the key (filters, metrics, groupedDimensions)
    const queryKey = {
        filters: metricQuery?.filters,
        metrics: metricQuery?.metrics,
        additionalMetrics: metricQuery?.additionalMetrics,
        groupedDimensions,
    };

    return useQuery<ApiCalculateSubtotalsResponse['results'], ApiError>({
        queryKey: ['calculate_subtotals', projectUuid, queryKey],
        queryFn: () =>
            projectUuid
                ? calculateSubtotalsFromQuery(
                      projectUuid,
                      metricQuery,
                      explore,
                      groupedDimensions,
                  )
                : Promise.reject(),
        retry: false,
        enabled:
            showSubtotals === true &&
            metricQuery !== undefined &&
            metricQuery.metrics.length > 0 &&
            groupedDimensions !== undefined &&
            groupedDimensions.length > 0,
        onError: (result) =>
            console.error(
                `Unable to calculate subtotals from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
