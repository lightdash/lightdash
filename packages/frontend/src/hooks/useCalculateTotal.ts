import {
    ApiCalculateTotalResponse,
    ApiError,
    CalculateTotalFromQuery,
    MetricQuery,
    MetricQueryRequest,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const calculateTotalFromQuery = async (
    projectUuid: string,
    metricQuery?: MetricQuery,
    explore?: string,
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
    };
    return lightdashApi<ApiCalculateTotalResponse['results']>({
        url: `/projects/${projectUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const calculateTotalFromSavedChart = async (
    savedChartUuid: string,
): Promise<ApiCalculateTotalResponse['results']> => {
    return lightdashApi<ApiCalculateTotalResponse['results']>({
        url: `/saved/${savedChartUuid}/calculate-total`,
        method: 'POST',
        body: '',
    });
};

export const useCalculateTotal = ({
    metricQuery,
    explore,
    savedChartUuid,
    fields,
}: {
    metricQuery?: MetricQueryRequest;
    explore?: string;
    savedChartUuid?: string;
    fields?: string[];
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    // only add relevant fields to the key (filters, metrics)
    const queryKey = savedChartUuid
        ? savedChartUuid
        : JSON.stringify({
              filters: metricQuery?.filters,
              metrics: metricQuery?.metrics,
              additionalMetrics: metricQuery?.additionalMetrics,
          });

    return useQuery<ApiCalculateTotalResponse['results'], ApiError>({
        queryKey: ['calculate_total', projectUuid, queryKey],
        queryFn: () =>
            savedChartUuid
                ? calculateTotalFromSavedChart(savedChartUuid)
                : calculateTotalFromQuery(projectUuid, metricQuery, explore),
        retry: false,
        enabled:
            (fields || []).length > 0 &&
            (metricQuery || savedChartUuid) !== undefined,
        onError: (result) =>
            console.error(
                `Unable to calculate total from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
