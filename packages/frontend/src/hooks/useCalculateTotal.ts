import {
    ApiCalculateTotalResponse,
    ApiError,
    CreateSavedChart,
    MetricQuery,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const calculateTotalFromQuery = async (
    projectUuid: string,
    payload: any,
): Promise<ApiCalculateTotalResponse['results']> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
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

export const useCalculateTotal = (data: {
    metricQuery?: MetricQuery;
    explore?: string;
    fields?: string[];
    savedChartUuid?: string;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const metricQuery = data.metricQuery;
    // only add relevant fields to the key (filters, metrics)
    const queryKey = JSON.stringify({
        filters: metricQuery?.filters,
        metrics: metricQuery?.metrics,
        additionalMetrics: metricQuery?.additionalMetrics,
    });

    return useQuery<ApiCalculateTotalResponse['results'], ApiError>({
        queryKey: ['calculate_total', projectUuid, queryKey],
        queryFn: () =>
            data.savedChartUuid
                ? calculateTotalFromSavedChart(data.savedChartUuid)
                : calculateTotalFromQuery(projectUuid, data),
        retry: false,
        enabled: (data?.fields || []).length > 0,
        onError: (result) =>
            console.error(
                `Unable to calculate total from query: ${result.error.message}`,
            ),
    });
};
