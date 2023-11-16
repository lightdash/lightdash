import {
    ApiError,
    CreateSavedChart,
    MetricQuery,
    SavedChart,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const getTotalCalculationFromQuery = async (
    projectUuid: string,
    payload: any,
): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
        },
    };
    return lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const getTotalCalculationFromSavedChart = async (
    savedChartUuid: string,
): Promise<SavedChart> => {
    return lightdashApi<SavedChart>({
        url: `/saved/${savedChartUuid}/calculate-total`,
        method: 'POST',
        body: '',
    });
};

export const useTotalCalculation = (data: {
    metricQuery?: MetricQuery;
    explore?: string;
    fields?: any[];
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

    return useQuery<SavedChart, ApiError>({
        queryKey: ['total_calculation', projectUuid, queryKey],
        queryFn: () =>
            data.savedChartUuid
                ? getTotalCalculationFromSavedChart(data.savedChartUuid)
                : getTotalCalculationFromQuery(projectUuid, data),
        retry: false,
        enabled: (data?.fields || []).length > 0,
        onError: (result) =>
            console.error(
                `Unable to get total calculation from query: ${result.error.message}`,
            ),
    });
};
